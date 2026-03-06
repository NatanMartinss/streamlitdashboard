import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import axios from "axios";
import mysql from "mysql2/promise";
import url from "url";
import fetch from "node-fetch";

/* ============================
   CONFIG
   ============================ */

let DB = {};

if (process.env.DATABASE_URL) {
  const parsed = new url.URL(process.env.DATABASE_URL);
  DB = {
    host: parsed.hostname,
    user: parsed.username,
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace("/", ""),
    port: parsed.port ? Number(parsed.port) : 3306,
    connectionLimit: 10,
  };
} else {
  DB = {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "bitcare_atend",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    connectionLimit: 10,
  };
}

const API_BASE = process.env.BASE_URL || "https://api.doutoraovivo.com.br";
const REPORT_PATH = "/report/appointment";
const APPOINTMENT_PATH = "/appointment/"; // + id
const PROTOCOL_PATH = "/protocol";

const DAYS_PER_REQUEST = Number(process.env.DAYS_PER_REQUEST || 35); // API limit
const CONCURRENCY_DETAIL = Number(process.env.CONCURRENCY_DETAIL || 6); // workers for /appointment/{id}
const CONCURRENCY_COMPANIES = Number(process.env.CONCURRENCY_COMPANIES || 3);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 3);
const FETCH_RETRY_BASE_MS = Number(process.env.FETCH_RETRY_BASE_MS || 700);
const SEQUENTIAL_COMPANIES = ((process.env.SEQUENTIAL_COMPANIES || 'false').toLowerCase() === 'true');
const STREAM_DETAILS_IMMEDIATE = ((process.env.STREAM_DETAILS_IMMEDIATE || 'false').toLowerCase() === 'true');

const LOG_PREFIX = "[fill-db]";

/* ============================
   HELPERS
   ============================ */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Split an array into chunks of given size
function chunkArray(arr, size) {
  if (!Array.isArray(arr) || size <= 0) return [arr || []];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Mask API key for safe logging
function maskKey(k) {
  if (!k) return null;
  const s = String(k);
  if (s.length <= 8) return `***${s.slice(-4)}`;
  return `${s.slice(0,4)}***${s.slice(-4)}`;
}

async function withRetry(fn, attempts = FETCH_RETRIES, baseMs = FETCH_RETRY_BASE_MS) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const wait = Math.min(60000, Math.pow(2, i) * baseMs + Math.random() * 200);
      console.warn(`${LOG_PREFIX} fetch failed (attempt ${i+1}/${attempts}): ${err?.message || err}. wait ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function toMySQLDatetimeUTC(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // 'YYYY-MM-DD HH:mm:ss' in UTC
  return d.toISOString().slice(0,19).replace('T',' ');
}

/* simple concurrency queue */
function pLimit(concurrency){
  const queue = [];
  let active = 0;
  const next = () => {
    if (queue.length === 0 || active >= concurrency) return;
    active++;
    const {fn, resolve, reject} = queue.shift();
    fn().then(v => { resolve(v); active--; next(); }).catch(e => { reject(e); active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({fn, resolve, reject});
    next();
  });
}

/* ============================
   DB Utilities
   ============================ */

let pool;

async function dbInit() {
  pool = mysql.createPool(DB);
  console.log(`${LOG_PREFIX} DB pool created (${DB.host}:${DB.port}/${DB.database})`);
}

async function dbClose() {
  if (pool) await pool.end();
}

// Detect recoverable connection errors
function isRecoverableDbError(err) {
  const msg = (err?.message || '').toLowerCase();
  const code = err?.code;
  return (
    msg.includes('closed state') ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED'
  );
}

// Query wrapper that retries using a fresh connection if the given one is closed
async function queryWithReconnect(conn, sql, params, attempts = 2) {
  try {
    return await conn.query(sql, params);
  } catch (err) {
    if (!isRecoverableDbError(err) || attempts <= 1) throw err;
    console.warn(`${LOG_PREFIX} conn.query failed: ${err?.message}. Retrying with a fresh connection...`);
    const tempConn = await pool.getConnection();
    try {
      return await tempConn.query(sql, params);
    } finally {
      tempConn.release();
    }
  }
}

/* Truncate everything except companies and users */


/* ============================
   Insert helpers (simple, batch)
   ============================ */

async function insertAppointments(conn, appointments, companyId) {
  if (!appointments || appointments.length === 0) return 0;
  const sql = `
    INSERT INTO appointments (
      id, company_id, status_appointment, appointment_specialty,
      schedule_date_time, executed_date_time, total_appointment_time,
      cid10_code, cid10_category, cid10_subcategory, cid10_value, detailed
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      status_appointment = VALUES(status_appointment),
      appointment_specialty = VALUES(appointment_specialty),
      schedule_date_time = VALUES(schedule_date_time),
      executed_date_time = VALUES(executed_date_time),
      total_appointment_time = VALUES(total_appointment_time),
      cid10_code = VALUES(cid10_code),
      cid10_category = VALUES(cid10_category),
      cid10_subcategory = VALUES(cid10_subcategory),
      cid10_value = VALUES(cid10_value)
  `;
  const rows = appointments.map(a => ([
    a.id,
    companyId,
    a.status_appointment || null,
    a.appointment_specialty || null,
    toMySQLDatetimeUTC(a.schedule_date_time),
    toMySQLDatetimeUTC(a.executed_date_time),
    (a.summary && a.summary.appointment_time) || a.total_appointment_time || null,
    (a.cid10 && a.cid10.code) || null,
    (a.cid10 && a.cid10.category) || null,
    (a.cid10 && a.cid10.subcategory) || null,
    (a.cid10 && a.cid10.value) || null,
    null
  ]));
  const [res] = await queryWithReconnect(conn, sql, [rows]);
  return res?.affectedRows ?? 0;
}

async function insertParticipants(conn, appointments, companyId) {
  if (!appointments || appointments.length === 0) return 0;
  const rows = [];
  for (const a of appointments) {
    const parts = a.participants || [];
    for (const p of parts) {
      rows.push([
        a.id,
        companyId,
        (p.cpf || p.cpf?.replace(/\D/g,'')) || null,
        p.role || null,
        toMySQLDatetimeUTC(p.start_date_time || p.start) ,
        toMySQLDatetimeUTC(p.end_date_time || p.end),
        (p.council_registry && p.council_registry.type) || p.council_type || null,
        (p.council_registry && p.council_registry.number) || p.council_number || null,
        (p.council_registry && p.council_registry.region) || p.council_region || null,
        p.name || null
      ]);
    }
  }
  if (rows.length === 0) return 0;
  const sql = `
    INSERT INTO appointment_participants (
      appointment_id, company_id, cpf, role, start_date_time, end_date_time,
      council_type, council_number, council_region, name
    ) VALUES ?
  `;
  const [res] = await queryWithReconnect(conn, sql, [rows]);
  return res?.affectedRows ?? 0;
}

async function insertDetails(conn, detailsArray, companyId) {
  if (!detailsArray || detailsArray.length === 0) return 0;
  const rows = detailsArray.map(d => ([
    d.appointment_id,
    companyId,
    d.description || null,
    d.reason || null,
    d.orientation || null,
    d.notes || null,
    (d.resume_total_time) || null
  ]));
  const sql = `
    INSERT INTO appointment_details (
      appointment_id, company_id, description, reason, orientation, notes, resume_total_time
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      reason = VALUES(reason),
      orientation = VALUES(orientation),
      notes = VALUES(notes),
      resume_total_time = VALUES(resume_total_time)
  `;
  const [res] = await queryWithReconnect(conn, sql, [rows]);
  return res?.affectedRows ?? 0;
}

async function insertFiles(conn, filesArray, companyId) {
  if (!filesArray || filesArray.length === 0) return 0;
  // Because 'files' table has no unique constraint, and we truncated the DB already,
  // we simply insert all files for a fresh load.
  const rows = filesArray.map(f => ([
    f.appointment_id,
    companyId,
    toMySQLDatetimeUTC(f.date || f.file_date),
    f.encoded || null,
    f.filePath || f.file_path || null,
    f.nameOriginal || f.name_original || null,
    f.participant || null
  ]));
  const sql = `
    INSERT INTO files (
      appointment_id, company_id, file_date, encoded, file_path, name_original, participant
    ) VALUES ?
  `;
  const [res] = await queryWithReconnect(conn, sql, [rows]);
  return res?.affectedRows ?? 0;
}

async function insertProtocol(conn, proto, companyId) {
  const sql = `
    INSERT INTO protocols (
      protocol_code, company_id, person_id, person_name, person_registration,
      arrival_time, start_attendance, reason_finished
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      person_name = VALUES(person_name),
      person_registration = VALUES(person_registration),
      arrival_time = VALUES(arrival_time),
      start_attendance = VALUES(start_attendance),
      reason_finished = VALUES(reason_finished)
  `;
  const vals = [
    proto.protocol,
    companyId,
    proto.person?.id || null,
    proto.person?.name || null,
    proto.person?.registration || null,
    toMySQLDatetimeUTC(proto.person?.arrival),
    toMySQLDatetimeUTC(proto.start_attendance),
    proto.reason_finished || null
  ];
  await queryWithReconnect(conn, sql, vals);

  // insert history rows
  const rows = (proto.history || []).map(h => ([
    /* protocol_id to be looked up after insert - we'll use last_insert or select by protocol_code */
    proto.protocol,
    toMySQLDatetimeUTC(h.ts),
    h.step || null,
    h.next_group || null,
    h.info?.professional_id || null,
    h.info?.professional_name || null,
    h.info?.professional_crm || null,
    h.info?.person_present ? 1 : 0,
    h.info?.professional_present ? 1 : 0,
    h.info?.appointment_id || null,
    h.info?.notes || null,
    h.info?.complaint || null,
    h.info?.place_in_line || null,
    JSON.stringify(h)
  ]));
  // Fetch protocol id
  const [rowsSel] = await queryWithReconnect(conn, "SELECT id FROM protocols WHERE protocol_code = ? LIMIT 1", [proto.protocol]);
  const protocolId = rowsSel[0]?.id;
  if (!protocolId) return;
  if (rows.length === 0) return;

  const histVals = rows.map(r => {
    // replace proto.protocol with protocolId
    const arr = r.slice();
    arr[0] = protocolId;
    return arr;
  });

  const sqlHist = `
    INSERT INTO protocol_history (
      protocol_id, ts, step, next_group,
      professional_id, professional_name, professional_crm,
      person_present, professional_present, appointment_id,
      notes, complaint, place_in_line, raw_json
    ) VALUES ?
  `;
  // Batch insert to avoid overly large packets
  const BATCH = 500;
  for (let i = 0; i < histVals.length; i += BATCH) {
    const chunk = histVals.slice(i, i + BATCH);
    await queryWithReconnect(conn, sqlHist, [chunk]);
  }
}

// Mark appointments as detailed=1 in batches
async function markAppointmentsDetailed(conn, companyId, appointmentIds) {
  if (!appointmentIds || appointmentIds.length === 0) return 0;
  const BATCH = 1000;
  let total = 0;
  for (let i = 0; i < appointmentIds.length; i += BATCH) {
    const chunk = appointmentIds.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '?').join(',');
    const sql = `UPDATE appointments SET detailed = 1 WHERE company_id = ? AND id IN (${placeholders})`;
    const params = [companyId, ...chunk];
    const [res] = await queryWithReconnect(conn, sql, params);
    total += res?.affectedRows ?? 0;
  }
  return total;
}

/* ============================
   API fetch functions
   ============================ */

async function fetchReportInterval(apiKey, startIso, endIso) {
  const url = `${API_BASE}${REPORT_PATH}`;
  const params = {
    schedule_start_range_start: startIso,
    schedule_start_range_finish: endIso,
    schedule_status: "REA",
    status: "true"
  };
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };
  // pagination by x-exclusive-start-key
  let nextKey = null;
  const all = [];
  let page = 0;
  do {
    page++;
    const callHeaders = {...headers};
    if (nextKey) callHeaders["x-exclusive-start-key"] = nextKey;
    console.log(`${LOG_PREFIX} [fetchReport] page=${page} start=${startIso} end=${endIso} params=${JSON.stringify(params)} headers=${JSON.stringify({"x-api-key": maskKey(callHeaders["x-api-key"]), "x-exclusive-start-key": callHeaders["x-exclusive-start-key"] || null})}`);
    const fn = async () => axios.get(url, { params, headers: callHeaders, timeout: 60000 });
    const res = await withRetry(fn);
    const data = res.data;
    const items = Array.isArray(data) ? data : (data.items || data.appointments || []);
    console.log(`${LOG_PREFIX}  report interval ${startIso}..${endIso} page ${page} got ${items.length}`);
    all.push(...items);
    nextKey = res.headers["x-exclusive-start-key"] || (data && data.next_key) || null;
    if (nextKey) console.log(`${LOG_PREFIX} [fetchReport] next key detected, continuing pagination`);
  } while (nextKey);
  return all;
}

async function fetchAppointmentDetail(apiKey, id) {
  const url = `${API_BASE}${APPOINTMENT_PATH}${id}`;
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };
  console.log(`${LOG_PREFIX} [fetchDetail] GET ${APPOINTMENT_PATH}${id} headers=${JSON.stringify({"x-api-key": maskKey(headers["x-api-key"])})}`);
  const fn = async () => axios.get(url, { headers, timeout: 30000 });
  const res = await withRetry(fn).catch(err => { throw err; });
  console.log(`${LOG_PREFIX} [fetchDetail] OK id=${id} status=${res.status}`);
  return res.data;
}

async function fetchProtocolsInterval(apiKey, startIso, endIso) {
  const url = `${API_BASE}${PROTOCOL_PATH}`;
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };
  let nextKey = null;
  const all = [];
  do {
    const callHeaders = {...headers};
    if (nextKey) callHeaders["x-exclusive-start-key"] = nextKey;
    const params = { date_from: startIso, date_to: endIso };
    console.log(`${LOG_PREFIX} [fetchProtocols] start=${startIso} end=${endIso} headers=${JSON.stringify({"x-api-key": maskKey(callHeaders["x-api-key"])})} nextKey=${nextKey || null}`);
    const fn = async () => axios.get(url, { params, headers: callHeaders, timeout: 60000 });
    const res = await withRetry(fn);
    console.log(`${LOG_PREFIX} [fetchProtocols] status=${res.status}`);
    const data = res.data;
    const items = Array.isArray(data) ? data : (data.items || data.protocols || []);
    all.push(...items);
    nextKey = res.headers["x-exclusive-start-key"] || (data && data.next_key) || null;
  } while (nextKey);
  return all;
}

/* ============================
   PROCESS COMPANY
   ============================ */

async function processCompany(company) {
  console.log(`${LOG_PREFIX} === processing company ${company.name} (id=${company.id}) ===`);
  const apiKey = company.api_key;
  if (!apiKey) { console.warn(`${LOG_PREFIX} company ${company.id} has no api_key, skipping`); return; }

  // determine period to fetch: you may change these
  const defaultStart = process.env.START_DATE || "2024-06-01T00:00:00.000Z";
  const defaultEnd   = process.env.END_DATE   || new Date().toISOString(); // now

  let start = new Date(defaultStart);
  const end = new Date(defaultEnd);

  const conn = await pool.getConnection();
  try {
    const allAppointmentsForCompany = [];

    while (start <= end) {
      const batchEnd = new Date(start);
      batchEnd.setDate(batchEnd.getDate() + DAYS_PER_REQUEST - 1);
      if (batchEnd > end) batchEnd.setTime(end.getTime());

      const startIso = new Date(start).toISOString();
      // for finish, make it the end of the day in UTC
      const finishIso = new Date(batchEnd).toISOString();

      console.log(`${LOG_PREFIX} [${company.name}] fetching report ${startIso} -> ${finishIso}`);
      let items = [];
      try {
        items = await fetchReportInterval(apiKey, startIso, finishIso);
      } catch (err) {
        console.error(`${LOG_PREFIX} [${company.name}] failed report interval: ${err?.message || err}`);
        // advance window to avoid infinite loop
        start.setDate(start.getDate() + DAYS_PER_REQUEST);
        continue;
      }

      if (items.length > 0) {
        // bulk insert appointments (basic fields)
        const inserted = await insertAppointments(conn, items, company.id);
        console.log(`${LOG_PREFIX} [${company.name}] appointments upserted: approx ${inserted}`);

        // insert participants (bulk)
        const partsInserted = await insertParticipants(conn, items, company.id);
        console.log(`${LOG_PREFIX} [${company.name}] participants inserted: approx ${partsInserted}`);

        allAppointmentsForCompany.push(...items);
      } else {
        console.log(`${LOG_PREFIX} [${company.name}] no appointments in this interval`);
      }

      start.setDate(start.getDate() + DAYS_PER_REQUEST);
    }

    // Now fetch details for each appointment with limited concurrency
    console.log(`${LOG_PREFIX} [${company.name}] fetching details for ${allAppointmentsForCompany.length} appointments (concurrency=${CONCURRENCY_DETAIL})`);

    const limit = pLimit(CONCURRENCY_DETAIL);
    const detailsArray = [];
    const filesArray = [];

    const tasks = allAppointmentsForCompany.map(a => limit(async () => {
      try {
        const detail = await fetchAppointmentDetail(apiKey, a.id);
        // detail may contain files, participants, notes, resume_session etc.
        // normalize for DB inserts:
        const detailRow = {
          appointment_id: a.id,
          description: detail.description || null,
          reason: detail.reason || null,
          orientation: detail.orientation || null,
          notes: detail.notes || null,
          resume_total_time: (detail.resume_session && detail.resume_session.total_appointment_time) || (detail.summary && detail.summary.appointment_time) || null
        };
        detailsArray.push(detailRow);

        const files = detail.files || detail.files || [];
        const fileRows = [];
        for (const f of files) {
          const row = Object.assign({}, f, { appointment_id: a.id });
          filesArray.push(row);
          fileRows.push(row);
        }

        // Optional streaming insert: write to DB immediately per appointment to populate tables in real-time
        if (STREAM_DETAILS_IMMEDIATE) {
          const tempConn = await pool.getConnection();
          try {
            await insertDetails(tempConn, [detailRow], company.id);
            if (fileRows.length > 0) {
              await insertFiles(tempConn, fileRows, company.id);
            }
            await markAppointmentsDetailed(tempConn, company.id, [a.id]);
            console.log(`${LOG_PREFIX} [${company.name}] streamed insert OK id=${a.id} files=${fileRows.length}`);
          } catch (e) {
            console.warn(`${LOG_PREFIX} [${company.name}] streamed insert failed id=${a.id}: ${e?.message || e}`);
          } finally {
            tempConn.release();
          }
        }
        return { ok: true, id: a.id };
      } catch (err) {
        console.warn(`${LOG_PREFIX} [${company.name}] detail failed for ${a.id}: ${err?.message || err}`);
        return { ok: false, id: a.id, error: err?.message || String(err) };
      }
    }));

    const results = await Promise.all(tasks);
    const successCount = results.filter(r => r.ok).length;
    console.log(`${LOG_PREFIX} [${company.name}] details fetched success ${successCount}/${results.length}`);

    // insert details and files in batches (skip if streaming is enabled to avoid duplicates)
    if (!STREAM_DETAILS_IMMEDIATE) {
      const dInserted = await insertDetails(conn, detailsArray, company.id);
      console.log(`${LOG_PREFIX} [${company.name}] details upserted: approx ${dInserted}`);

      const fInserted = await insertFiles(conn, filesArray, company.id);
      console.log(`${LOG_PREFIX} [${company.name}] files inserted: approx ${fInserted}`);
    } else {
      console.log(`${LOG_PREFIX} [${company.name}] streaming mode active — skipped batch inserts`);
    }

    // Mark detailed=1 for appointments whose details were successfully fetched and inserted
    if (!STREAM_DETAILS_IMMEDIATE) {
      try {
        const successIds = Array.from(new Set(detailsArray.map(d => d.appointment_id)));
        const flagged = await markAppointmentsDetailed(conn, company.id, successIds);
        console.log(`${LOG_PREFIX} [${company.name}] appointments marked detailed=1: ${flagged}`);
      } catch (e) {
        console.warn(`${LOG_PREFIX} [${company.name}] failed to mark detailed=1: ${e?.message || e}`);
      }
    }

    // Protocols: fetch for the same window (optional)
    // We'll fetch for the same global start/end used above
    try {
      const protoStart = process.env.PROTOCOL_START || new Date().toISOString();
      // to be safe, fetch protocols for last 3 months or an env window; here we fetch same defaultStart..defaultEnd
      const protoItems = await fetchProtocolsInterval(apiKey, process.env.START_DATE || "2024-06-01T00:00:00.000Z", process.env.END_DATE || new Date().toISOString());
      console.log(`${LOG_PREFIX} [${company.name}] protocols fetched: ${protoItems.length}`);
      for (const p of protoItems) {
        try {
          await insertProtocol(conn, p, company.id);
        } catch (e) {
          console.warn(`${LOG_PREFIX} [${company.name}] insertProtocol failed for ${p.protocol}: ${e?.message || e}`);
        }
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} [${company.name}] protocol fetch failed: ${e?.message || e}`);
    }

  } finally {
    conn.release();
  }

  console.log(`${LOG_PREFIX} === finished company ${company.name} ===`);
}

/* ============================
   MAIN
   ============================ */

// Fetch com retry automático


async function main() {
  console.log("🚀 Iniciando processamento de empresas...\n");
  // Ensure DB pool is initialized before any queries
  await dbInit();

  const [companies] = await pool.query(`
    SELECT id, name, api_key, api_secret
    FROM companies
    WHERE is_active = 1
  `);

  console.log(`📦 ${companies.length} empresas ativas encontradas.\n`);

  if (SEQUENTIAL_COMPANIES) {
    console.log(`${LOG_PREFIX} executando em modo sequencial (uma empresa por vez)`);
    for (const company of companies) {
      console.log(`🏢 ${company.name} — iniciando coleta (sequencial)...`);
      try {
        await processCompany(company);
        console.log(`✅ ${company.name} — concluída com sucesso.`);
      } catch (error) {
        console.error(`❌ ${company.name} — falha:`, error?.message || String(error));
      }
      await sleep(1000);
    }
  } else {
    const companyChunks = chunkArray(companies, CONCURRENCY_COMPANIES);
    for (const [index, chunk] of companyChunks.entries()) {
      console.log(`⚙️  Grupo ${index + 1}/${companyChunks.length} — ${chunk.length} empresas`);
      const results = await Promise.allSettled(
        chunk.map(async (company) => {
          console.log(`🏢 ${company.name} — iniciando coleta...`);
          try {
            await processCompany(company);
            console.log(`✅ ${company.name} — concluída com sucesso.`);
          } catch (error) {
            console.error(`❌ ${company.name} — falha:`, error?.message || String(error));
          }
        })
      );
      const success = results.filter(r => r.status === "fulfilled").length;
      const fail = results.filter(r => r.status === "rejected").length;
      console.log(`📊 Grupo ${index + 1} finalizado — Sucesso: ${success}, Falhas: ${fail}\n`);
      await sleep(1500); // descanso entre grupos
    }
  }

  console.log("🏁 Processamento finalizado com sucesso!");
  await dbClose();
}

main().catch((err) => {
  console.error("💥 Erro fatal no main():", err);
  dbClose();
  process.exit(1);
});
