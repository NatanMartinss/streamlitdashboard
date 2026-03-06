// enriquecedor-consultas-robusto.js
// Node 18+ (fetch nativo). Uso: node enriquecedor-consultas-robusto.js

import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://api.v2.doutoraovivo.com.br";
const FILE_PATH = path.resolve("./consultastotais.json");
const TMP_PATH = path.resolve("./consultastotais.json.tmp");

// CONFIG
const CONCURRENCY = 30;          
const FETCH_RETRIES = 3;         
const FETCH_BASE_DELAY = 1000;   
const SAVE_EVERY = 50;           
const EXTRA_ROUNDS = 2;          

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Retry com backoff exponencial
async function retryFetch(url, options = {}, retries = FETCH_RETRIES, baseDelay = FETCH_BASE_DELAY) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      const next = Math.pow(2, attempt) * baseDelay;
      console.warn(`⚠️ [Retry] ${url} falhou (attempt ${attempt + 1}/${retries}): ${err.message}. esperando ${next}ms`);
      if (attempt < retries - 1) await sleep(next);
    }
  }
  throw lastErr;
}

// Salva checkpoint atômico
let saving = false;
async function saveCheckpointAtomic(data) {
  while (saving) await sleep(50);
  saving = true;
  try {
    await fs.writeFile(TMP_PATH, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(TMP_PATH, FILE_PATH);
  } finally {
    saving = false;
  }
}

// Enriquecer uma única consulta (PAT + MED)
async function enriquecerConsulta(consulta) {
  const id = consulta.id;
  const apiKey = consulta.apiKey;

  if (!id) {
    consulta.__enrichment_error = "appointment sem id";
    return { ok: false, id, error: consulta.__enrichment_error };
  }

  try {
    // 1) buscar appointment detalhado
    const detalhes = await retryFetch(`${BASE_URL}/appointment/${id}`, {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    });

    const participants = Array.isArray(detalhes.participants) ? detalhes.participants : (consulta.participants || []);

    // 2) enriquecer PAT e MED
    await Promise.all(participants.map(async (p) => {
      if (!p || !p.role) return;

      const role = String(p.role).toUpperCase();

      // PAT
      if (role === "PAT") {
        if (!p.id && !p.cpf) { p.__person_lookup_issue = "nenhum id ou cpf disponível"; return; }
        const personUrl = p.id ? `${BASE_URL}/person/${p.id}` : `${BASE_URL}/person/${p.cpf}`;
        try {
          const paciente = await retryFetch(personUrl, {
            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          });
          Object.assign(p, {
            id: paciente.id ?? p.id,
            nome: paciente.name ?? p.name,
            cpf: paciente.cpf ?? p.cpf,
            birthdate: paciente.birth_date ?? paciente.birthdate,
            planId: paciente.plan_id ?? p.planId,
            planStatus: paciente.plan_status ?? p.planStatus,
            __person_fetched_at: new Date().toISOString(),
          });
        } catch (err) { p.__person_fetch_error = err?.message ?? String(err); }
      }

      // MED
      else if (role === "MMD") {
        if (!p.id) { p.__professional_lookup_issue = "nenhum id disponível"; return; }
        try {
          const doc = await retryFetch(`${BASE_URL}/professional/${p.id}`, {
            headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          });
          Object.assign(p, {
            name: doc.name ?? p.name,
            crm: doc.crm ?? p.crm,
            license_number: doc.license_number ?? p.license_number,
            license_council: doc.license_council ?? p.license_council,
            license_region: doc.license_region ?? p.license_region,
            __professional_fetched_at: new Date().toISOString(),
          });
        } catch (err) { p.__professional_fetch_error = err?.message ?? String(err); }
      }

      // outros roles permanecem intactos
    }));

    // 3) atualiza consulta
    consulta.participants = participants;
    consulta.__enriched_at = new Date().toISOString();
    delete consulta.__enrichment_error;

    return { ok: true, id };
  } catch (err) {
    consulta.__enrichment_error = err?.message ?? String(err);
    return { ok: false, id, error: consulta.__enrichment_error };
  }
}

// Worker pool
async function processarConsultas(consultas, concurrency = CONCURRENCY) {
  let index = 0, processed = 0, success = 0, failed = 0;
  const failedList = [];

  async function worker(workerId) {
    while (true) {
      const i = index++;
      if (i >= consultas.length) break;
      const consulta = consultas[i];

      console.log(`(W${workerId}) [${i + 1}/${consultas.length}] iniciando ${consulta.id || "<sem-id>"}`);
      const res = await enriquecerConsulta(consulta);
      processed++;
      if (res.ok) { success++; console.log(`(W${workerId}) ✅ ${consulta.id} ok (${processed}/${consultas.length})`); }
      else { failed++; failedList.push(consulta); console.warn(`(W${workerId}) ❌ ${consulta.id} falhou: ${res.error}`); }

      if (processed % SAVE_EVERY === 0) {
        console.log(`🔁 Salvando checkpoint (processed=${processed})...`);
        await saveCheckpointAtomic(consultas);
        console.log(`🔁 Checkpoint salvo.`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, n) => worker(n + 1));
  await Promise.all(workers);

  await saveCheckpointAtomic(consultas);
  return { processed, success, failed, failedList };
}

// Reprocessamento de falhas
async function reprocessFailures(failedList, rounds = EXTRA_ROUNDS, concurrency = CONCURRENCY) {
  let round = 0;
  let remaining = failedList;
  while (round < rounds && remaining.length > 0) {
    round++;
    console.log(`🔁 Reprocessando falhas - round ${round}/${rounds} (count=${remaining.length})`);
    const { processed, success, failed, failedList: newFailed } = await processarConsultas(remaining, concurrency);
    console.log(`🔁 Round ${round} feito — processed=${processed}, success=${success}, still failed=${newFailed.length}`);
    remaining = newFailed;
  }
  return remaining;
}

// MAIN
async function main() {
  try {
    const text = await fs.readFile(FILE_PATH, "utf-8");
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      console.error("Formato inesperado: JSON deve ser array de consultas");
      return;
    }

    console.log(`🔹 Iniciando enriquecimento de ${data.length} consultas com concurrency=${CONCURRENCY}`);

    const result = await processarConsultas(data, CONCURRENCY);
    console.log(`🏁 Passagem inicial feita. processed=${result.processed}, success=${result.success}, failed=${result.failed}`);

    if (result.failed > 0) {
      const stillFailed = await reprocessFailures(result.failedList, EXTRA_ROUNDS, CONCURRENCY);
      console.log(`🔚 Reprocessamento finalizado. ainda-falharam=${stillFailed.length}`);
      if (stillFailed.length > 0) {
        console.warn("⚠️ Algumas consultas não foram enriquecidas. Verifique __enrichment_error ou __person_fetch_error/__professional_fetch_error no JSON.");
      }
    }

    await saveCheckpointAtomic(data);
    console.log("✅ Enriquecimento completo. Arquivo atualizado com sucesso.");
  } catch (err) {
    console.error("ERRO FATAL:", err?.message ?? err);
  }
}

main();
