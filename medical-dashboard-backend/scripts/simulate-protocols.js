/**
 * Simulador de protocolos em tempo real
 *
 * O que faz:
 * - Envia ~5 protocolos por empresa para o endpoint REST `/realtime/events`
 * - Para cada protocolo, envia a sequência de eventos: entrada, fila, pronto, início e fim
 * - Atualiza o Tempo Real do frontend (via Socket.IO broadcast do backend)
 *
 * Como usar (exemplos):
 * - node scripts/simulate-protocols.js --base http://localhost:3000 --companies 1,2 --count 5 --delay 800
 * - node scripts/simulate-protocols.js --base http://localhost:3000 --company_keys ACMEKEY1,ACMEKEY2 --count 3
 *
 * Opções:
 * --base           URL base do backend (ex: http://localhost:3000)
 * --companies      IDs de empresas separados por vírgula (ex: 1,2,3)
 * --company_keys   Keys de empresas separados por vírgula (ex: ACME,FOO)
 * --count          Protocolos por empresa (default: 5)
 * --delay          Delay em ms entre eventos de um mesmo protocolo (default: 800)
 * --staged         Deixa 1 paciente por empresa em cada etapa (default: true)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs() {
  const args = process.argv.slice(2);
  const cfg = {
    base: process.env.PORT || 'http://localhost:8000',
    companies: [],
    companyKeys: [],
    count: Number(process.env.PROTOCOLS_PER_COMPANY || 5),
    delay: Number(process.env.EVENT_DELAY_MS || 800),
    staged: true,
  };

  for (const arg of args) {
    if (arg.startsWith('--base=')) cfg.base = arg.split('=')[1];
    else if (arg.startsWith('--companies=')) cfg.companies = arg.split('=')[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
    else if (arg.startsWith('--company_keys=')) cfg.companyKeys = arg.split('=')[1].split(',').map((x) => x.trim()).filter(Boolean);
    else if (arg.startsWith('--count=')) cfg.count = Number(arg.split('=')[1]);
    else if (arg.startsWith('--delay=')) cfg.delay = Number(arg.split('=')[1]);
    else if (arg === '--staged' || arg.startsWith('--staged=')) {
      const val = arg.includes('=') ? arg.split('=')[1] : 'true';
      cfg.staged = ['true','1','yes','on'].includes(val.toLowerCase());
    }
  }

  if (!cfg.companies.length && !cfg.companyKeys.length) {
    // fallback amigável
    cfg.companies = [1];
  }
  return cfg;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJSON(method, urlString, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlString);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const payload = data ? Buffer.from(JSON.stringify(data)) : null;
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : 0,
      },
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function randomCPF() {
  // Simples gerador de CPF não-validado (apenas para testes)
  const rand = () => Math.floor(Math.random() * 9);
  return `${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}${rand()}`.slice(0, 11);
}

function randomName() {
  const names = ['Ana Silva', 'Bruno Souza', 'Carlos Pereira', 'Daniela Lima', 'Eduardo Alves', 'Fernanda Rocha', 'Gustavo Moreira', 'Helena Santos'];
  return names[Math.floor(Math.random() * names.length)];
}

function protocolCode(companyIdOrKey, idx) {
  const now = Date.now().toString(36).toUpperCase();
  return `PRT-${companyIdOrKey}-${idx}-${now.slice(-5)}`;
}

async function postEvent(base, payload) {
  const url = `${base.replace(/\/$/, '')}/realtime/events`;
  return requestJSON('POST', url, payload);
}

function makeEventPayload({ companyId, companyKey, protocol, name, cpf, event, nextGroup }) {
  const timestamp = new Date().toISOString();
  return {
    company_id: companyId,
    company_key: companyKey,
    protocol,
    name,
    cpf,
    event,
    next_group: nextGroup,
    timestamp,
  };
}

async function simulateProtocolFlow(base, companyId, companyKey, protoIdx, delayMs) {
  const idOrKey = companyId ?? companyKey;
  const proto = protocolCode(idOrKey, protoIdx);
  const name = randomName();
  const cpf = randomCPF();

  const sequence = [
    { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
    { event: 'PERSON_PLACE_IN_LINE', nextGroup: 'Confirmação de Dados' },
    { event: 'PERSON_READY_TO_ATTENDANCE', nextGroup: 'Consultório' },
    { event: 'PERSON_START_ATTENDANCE', nextGroup: undefined },
    { event: 'PERSON_FINISH_ATTENDANCE', nextGroup: undefined },
  ];

  for (const step of sequence) {
    const payload = makeEventPayload({ companyId, companyKey, protocol: proto, name, cpf, event: step.event, nextGroup: step.nextGroup });
    const res = await postEvent(base, payload);
    // Log resumido
    console.log(`[${idOrKey}] ${proto} • ${step.event} • ${step.nextGroup || ''} • ${res?.id ?? ''}`);
    await sleep(delayMs);
  }
}

async function simulateProtocolToStage(base, companyId, companyKey, protoIdx, stage, delayMs) {
  const idOrKey = companyId ?? companyKey;
  const proto = protocolCode(idOrKey, protoIdx);
  const name = randomName();
  const cpf = randomCPF();

  const sequences = {
    enter: [
      { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
    ],
    place: [
      { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
      { event: 'PERSON_PLACE_IN_LINE', nextGroup: 'Confirmação de Dados' },
    ],
    ready: [
      { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
      { event: 'PERSON_PLACE_IN_LINE', nextGroup: 'Confirmação de Dados' },
      { event: 'PERSON_READY_TO_ATTENDANCE', nextGroup: 'Consultório' },
    ],
    start: [
      { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
      { event: 'PERSON_PLACE_IN_LINE', nextGroup: 'Confirmação de Dados' },
      { event: 'PERSON_READY_TO_ATTENDANCE', nextGroup: 'Consultório' },
      { event: 'PERSON_START_ATTENDANCE', nextGroup: undefined },
    ],
    medical: [
      { event: 'PERSON_ENTER_EMERGENCY', nextGroup: 'Recepção' },
      { event: 'PERSON_PLACE_IN_LINE', nextGroup: 'Confirmação de Dados' },
      { event: 'PERSON_READY_TO_ATTENDANCE', nextGroup: 'Consultório' },
      { event: 'PROFESSIONAL_START_ATTENDANCE', nextGroup: undefined },
    ],
  };

  const seq = sequences[stage];
  if (!seq) throw new Error(`Etapa inválida: ${stage}`);

  for (const step of seq) {
    const payload = makeEventPayload({ companyId, companyKey, protocol: proto, name, cpf, event: step.event, nextGroup: step.nextGroup });
    const res = await postEvent(base, payload);
    console.log(`[${idOrKey}] ${proto} • ${step.event} • ${step.nextGroup || ''} • ${res?.id ?? ''}`);
    await sleep(delayMs);
  }
}

async function main() {
  const cfg = parseArgs();
  console.log('Config:', cfg);

  const targets = [];
  if (cfg.companies.length) {
    for (const cid of cfg.companies) targets.push({ companyId: cid, companyKey: undefined });
  }
  if (cfg.companyKeys.length) {
    for (const ck of cfg.companyKeys) targets.push({ companyId: undefined, companyKey: ck });
  }

  for (const target of targets) {
    if (cfg.staged) {
      const stages = ['enter', 'place', 'ready', 'start', 'medical'];
      let idx = 1;
      for (const st of stages) {
        try {
          await simulateProtocolToStage(cfg.base, target.companyId, target.companyKey, idx++, st, cfg.delay);
        } catch (err) {
          console.error('Erro ao simular protocolo (staged):', err?.message || err);
        }
      }
    } else {
      for (let i = 1; i <= cfg.count; i++) {
        try {
          await simulateProtocolFlow(cfg.base, target.companyId, target.companyKey, i, cfg.delay);
        } catch (err) {
          console.error('Erro ao simular protocolo:', err?.message || err);
        }
      }
    }
  }

  console.log('Simulação concluída. Verifique o Tempo Real no frontend.');
}

main().catch((err) => {
  console.error('Falha na simulação:', err?.message || err);
  process.exit(1);
});