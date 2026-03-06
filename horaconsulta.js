// horaconsulta.js
// Node 18+ — Calcula medianas de tempos por empresa a partir do banco
// Uso:
//   node horaconsulta.js --from 2024-11-01 --to 2024-11-30
//   node horaconsulta.js --from 2024-11-01 --to 2024-11-30 --company_id 3

import mysql from 'mysql2/promise';

// Config de banco — usa o mesmo alvo do cron
const DB_CONFIG = {
  host: 'bitcare_atend.mysql.dbaas.com.br',
  user: 'bitcare_atend',
  password: 'Bitcare#Prod20',
  database: 'bitcare_atend',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') out.from = args[++i];
    else if (a === '--to') out.to = args[++i];
    else if (a === '--company_id') out.company_id = Number(args[++i]);
  }
  return out;
}

function median(values) {
  const arr = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function average(values) {
  const arr = values.filter(v => Number.isFinite(v));
  if (arr.length === 0) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s) || isNaN(e)) return null;
  return (e - s) / 60000; // minutos
}

async function getActiveCompanies(conn) {
  const [rows] = await conn.query(
    `SELECT id, api_key, name
     FROM companies
     WHERE api_key IS NOT NULL AND api_key <> ''
       AND (is_active = 1 OR is_active IS NULL)`
  );
  return rows.map(r => ({ id: r.id, api_key: r.api_key, name: r.name }));
}

async function fetchAppointmentsWithDetails(conn, companyId, from, to) {
  const [rows] = await conn.query(
    `SELECT a.id, a.company_id, a.status_appointment, a.appointment_specialty,
            a.schedule_date_time, a.executed_date_time, a.total_appointment_time,
            d.resume_total_time
     FROM appointments a
     LEFT JOIN appointment_details d
       ON d.appointment_id = a.id AND d.company_id = a.company_id
     WHERE a.company_id = ?
       AND a.executed_date_time BETWEEN ? AND ?`,
    [companyId, from, to]
  );
  return rows;
}

async function fetchTopDoctors(conn, companyId, from, to) {
  const [rows] = await conn.query(
    `SELECT ap.name AS doctor_name, COUNT(*) AS appointments
     FROM appointment_participants ap
     INNER JOIN appointments a ON a.id = ap.appointment_id AND a.company_id = ap.company_id
     WHERE ap.company_id = ?
       AND ap.role = 'MMD'
       AND a.executed_date_time BETWEEN ? AND ?
       AND (a.appointment_specialty IS NULL OR a.appointment_specialty NOT LIKE '%dados%')
     GROUP BY ap.name
     ORDER BY appointments DESC
     LIMIT 10`,
    [companyId, from, to]
  );
  return rows.map(r => ({ doctor_name: r.doctor_name, appointments: Number(r.appointments) }));
}

async function fetchTopSpecialties(conn, companyId, from, to) {
  const [rows] = await conn.query(
    `SELECT a.appointment_specialty AS name, COUNT(*) AS count
     FROM appointments a
     WHERE a.company_id = ?
       AND a.executed_date_time BETWEEN ? AND ?
       AND (a.appointment_specialty IS NULL OR a.appointment_specialty NOT LIKE '%dados%')
     GROUP BY a.appointment_specialty
     ORDER BY COUNT(*) DESC
     LIMIT 10`,
    [companyId, from, to]
  );
  return rows.map(r => ({ name: r.name ?? 'Sem especialidade', count: String(r.count) }));
}

function computeWeekdayDistribution(appts) {
  const byWeekday = new Map(); // weekday 1..7
  for (const r of appts) {
    if (!r.executed_date_time) continue;
    if (r.appointment_specialty && String(r.appointment_specialty).toLowerCase().includes('dados')) continue;
    const d = new Date(r.executed_date_time);
    const jsWeekday = d.getDay(); // 0..6 (0 domingo)
    const weekday = jsWeekday === 0 ? 1 : jsWeekday + 1; // 1..7
    byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + 1);
  }
  const label = {1:'Domingo',2:'Segunda-feira',3:'Terça-feira',4:'Quarta-feira',5:'Quinta-feira',6:'Sexta-feira',7:'Sábado'};
  return Array.from({ length: 7 }, (_, i) => {
    const weekday = i + 1;
    return { weekday, label: label[weekday], total: byWeekday.get(weekday) || 0 };
  });
}

function computeHourDistribution(appts) {
  const byHour = new Array(24).fill(0);
  for (const r of appts) {
    if (!r.executed_date_time) continue;
    if (r.appointment_specialty && String(r.appointment_specialty).toLowerCase().includes('dados')) continue;
    const d = new Date(r.executed_date_time);
    const h = d.getHours();
    byHour[h]++;
  }
  return byHour.map((total, hour) => ({ hour, label: String(hour).padStart(2,'0')+':00', total }));
}

async function upsertDashboardData(conn, companyId, fromStr, toStr, payload) {
  const startDate = new Date(`${fromStr}T00:00:00`);
  const endDate = new Date(`${toStr}T00:00:00`);
  const sql = `
    INSERT INTO dashboard_data (
      company_id, start_date, end_date,
      counts_total, counts_medicas, counts_confirmacoes,
      day_of_week, hour_of_day, wait_times, service_times, top_doctors, top_specialties
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      counts_total = VALUES(counts_total),
      counts_medicas = VALUES(counts_medicas),
      counts_confirmacoes = VALUES(counts_confirmacoes),
      day_of_week = VALUES(day_of_week),
      hour_of_day = VALUES(hour_of_day),
      wait_times = VALUES(wait_times),
      service_times = VALUES(service_times),
      top_doctors = VALUES(top_doctors),
      top_specialties = VALUES(top_specialties)
  `;
  const values = [
    companyId,
    startDate,
    endDate,
    payload.counts.total,
    payload.counts.medicas,
    payload.counts.confirmacoes,
    JSON.stringify(payload.dayOfWeek),
    JSON.stringify(payload.hourOfDay),
    JSON.stringify(payload.waitTimes),
    JSON.stringify(payload.serviceTimes),
    JSON.stringify(payload.topDoctors),
    JSON.stringify(payload.topSpecialties),
  ];
  await conn.query(sql, values);
}

async function main() {
  const args = parseArgs();
  if (!args.from || !args.to) {
    console.error('Uso: node horaconsulta.js --from YYYY-MM-DD --to YYYY-MM-DD [--company_id N]');
    process.exit(1);
  }

  // Janela como DATETIME local (MySQL espera DATETIME sem timezone);
  // Mantemos coerência com consultas do backend (executed_date_time em UTC-3 gravado como local).
  const from = new Date(`${args.from}T00:00:00`);
  const to = new Date(`${args.to}T23:59:59.999`);

  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const companies = args.company_id
      ? [{ id: args.company_id, name: `company_${args.company_id}` }]
      : await getActiveCompanies(conn);

    const results = [];
    for (const c of companies) {
      const appts = await fetchAppointmentsWithDetails(conn, c.id, from, to);

      // Separações por especialidade: confirmações de dados vs consultas médicas
      const isDados = (spec) => spec && String(spec).toLowerCase().includes('dados');

      // Tempo de atendimento médico (preferir resume_total_time; fallback total_appointment_time)
      const medDurations = appts
        .filter(r => !isDados(r.appointment_specialty))
        .map(r => {
          const t = Number.isFinite(r.resume_total_time) && r.resume_total_time > 0
            ? r.resume_total_time
            : (Number.isFinite(r.total_appointment_time) ? r.total_appointment_time : null);
          return t != null ? t / 60 : null; // minutos
        })
        .filter(v => v != null);

      // Tempo de confirmação de dados (usar total_appointment_time como duração da confirmação)
      const confirmDurations = appts
        .filter(r => isDados(r.appointment_specialty))
        .map(r => Number.isFinite(r.total_appointment_time) ? r.total_appointment_time / 60 : null)
        .filter(v => v != null);

      // Tempo de espera total (executed - schedule) — aproximação sem protocolo
      const waits = appts
        .map(r => minutesBetween(r.schedule_date_time, r.executed_date_time))
        .filter(v => v != null && v >= 0);
      const counts = {
        total: appts.length,
        medicas: appts.filter(r => !isDados(r.appointment_specialty)).length,
        confirmacoes: appts.filter(r => isDados(r.appointment_specialty)).length,
      };
      const dayOfWeek = computeWeekdayDistribution(appts);
      const hourOfDay = computeHourDistribution(appts);

      const payload = {
        counts,
        dayOfWeek,
        hourOfDay,
        waitTimes: {
          covered_total_time: waits.length,
          avg_total_time_minutes: average(waits),
        },
        serviceTimes: {
          confirmationMinutes: median(confirmDurations),
          medicalMinutes: median(medDurations),
        },
        topDoctors: await fetchTopDoctors(conn, c.id, from, to),
        topSpecialties: await fetchTopSpecialties(conn, c.id, from, to),
      };

      await upsertDashboardData(conn, c.id, args.from, args.to, payload);

      results.push({
        company_id: c.id,
        company_name: c.name || null,
        period: { from: args.from, to: args.to },
        ...payload,
      });
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (err) {
    console.error('Erro ao calcular medianas:', err?.message || err);
    process.exit(2);
  } finally {
    try { await conn.end(); } catch {}
  }
}

main();