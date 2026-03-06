import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentParticipant, User, Protocol, ProtocolHistory, DashboardData } from '../entities';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(AppointmentParticipant)
    private participantRepository: Repository<AppointmentParticipant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Protocol)
    private protocolRepository: Repository<Protocol>,
    @InjectRepository(ProtocolHistory)
    private protocolHistoryRepository: Repository<ProtocolHistory>,
    @InjectRepository(DashboardData)
    private dashboardDataRepository: Repository<DashboardData>,
  ) { }

  async getTopDoctors(companyId: number, startDate: string, endDate: string): Promise<any[]> {
    try {
      const query = `
        SELECT 
          ap.name as doctor_name,
          COUNT(DISTINCT a.id) AS appointments
        FROM appointments a
        JOIN appointment_participants ap ON a.id = ap.appointment_id
        WHERE a.company_id = ?
          AND ap.role = 'mmd'
          AND ap.name NOT LIKE '%Elisia%'
          AND (a.appointment_specialty IS NULL OR a.appointment_specialty NOT LIKE '%dados%')
          AND DATE(a.executed_date_time) BETWEEN ? AND ?
        GROUP BY ap.name
        ORDER BY appointments DESC
        LIMIT 10
      `;

      const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      return result.map(row => ({
        doctor_name: row.doctor_name ? row.doctor_name.trim() : 'N/A',
        appointments: parseInt(row.appointments) || 0
      }));
    } catch (error) {
      console.error('Erro ao buscar top médicos:', error);
      return [];
    }
  }

  private minutesBetween(a?: Date | string | null, b?: Date | string | null): number | null {
    if (!a || !b) return null;
    const t1 = new Date(a).getTime();
    const t2 = new Date(b).getTime();
    if (isNaN(t1) || isNaN(t2)) return null;
    const diffMs = t2 - t1;
    if (diffMs < 0) return null;
    return Math.round((diffMs / 1000 / 60) * 100) / 100;
  }

  private median(values: Array<number | null | undefined>): number | null {
    const arr = values.filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    if (arr.length === 0) return null;
    arr.sort((x, y) => x - y);
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 0) {
      return Math.round(((arr[mid - 1] + arr[mid]) / 2) * 100) / 100;
    }
    return arr[mid];
  }

  private average(values: Array<number | null | undefined>): number | null {
    const arr = values.filter(v => typeof v === 'number' && Number.isFinite(v)) as number[];
    if (arr.length === 0) return null;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round((sum / arr.length) * 100) / 100;
  }

  async getWaitTimesFromAppointments(companyId: number, startDate: string, endDate: string, refresh = false) {
    try {
      

      // Carrega dados necessários em um único join (inclui CPF do paciente)
      // IMPORTANTE: usa CONVERT_TZ para alinhar tudo ao fuso UTC-3
      const rows = await this.appointmentRepository.query(
        `SELECT 
           a.id,
           a.company_id,
           a.appointment_specialty,
           a.schedule_date_time,
           a.executed_date_time,
           a.total_appointment_time,
           a.status_appointment,
           (
             SELECT ad.resume_total_time 
             FROM appointment_details ad 
             WHERE ad.appointment_id = a.id AND ad.company_id = a.company_id 
             ORDER BY ad.id DESC LIMIT 1
           ) AS resume_total_time,
           -- Subselects garantem 1 linha por atendimento (evita multiplicação por JOIN)
           (
             SELECT m.start_date_time 
             FROM appointment_participants m 
             WHERE m.appointment_id = a.id AND m.company_id = a.company_id AND m.role = 'MMD' 
             ORDER BY m.id ASC LIMIT 1
           ) AS conf_start,
           (
             SELECT m.end_date_time 
             FROM appointment_participants m 
             WHERE m.appointment_id = a.id AND m.company_id = a.company_id AND m.role = 'MMD' 
             ORDER BY m.id ASC LIMIT 1
           ) AS conf_end,
           (
             SELECT p.cpf 
             FROM appointment_participants p 
             WHERE p.appointment_id = a.id AND p.company_id = a.company_id AND p.role = 'PAT' 
             ORDER BY p.id ASC LIMIT 1
           ) AS pat_cpf,
           (
             SELECT p.name 
             FROM appointment_participants p 
             WHERE p.appointment_id = a.id AND p.company_id = a.company_id AND p.role = 'PAT' 
             ORDER BY p.id ASC LIMIT 1
           ) AS pat_name
         FROM appointments a
         WHERE a.company_id = ?
           AND a.executed_date_time IS NOT NULL
           AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
           AND (
             a.status_appointment IS NULL OR 
             LOWER(TRIM(a.status_appointment)) NOT IN ('cancelled','canceled','rescheduled','reagendado','reagendada')
           )`,
        [companyId, startDate, endDate]
      );

      const isDados = (s: any) => s && String(s).toLowerCase().includes('dados');

      // Durações médicas em MINUTOS (preferir resume_total_time; fallback total_appointment_time)
      const medDurations = rows
        .filter((r: any) => !isDados(r.appointment_specialty))
        .map((r: any) => {
          const raw = r.resume_total_time != null
            ? Number(r.resume_total_time)
            : (r.total_appointment_time != null ? Number(r.total_appointment_time) : null);
          return raw != null ? Math.round((raw / 60) * 100) / 100 : null; // segundos -> minutos
        })
        .filter((v: any) => v != null);

      // Durações de confirmação em MINUTOS (usar total_appointment_time das confirmações)
      const confirmDurations = rows
        .filter((r: any) => isDados(r.appointment_specialty))
        .map((r: any) => {
          const raw = r.total_appointment_time != null ? Number(r.total_appointment_time) : null;
          return raw != null ? Math.round((raw / 60) * 100) / 100 : null; // segundos -> minutos
        })
        .filter((v: any) => v != null);

      const waits = rows
        .map((r: any) => this.minutesBetween(r.schedule_date_time, r.executed_date_time))
        .filter((v: any) => v != null && v >= 0);

      // Encadear confirmação → primeira consulta médica em até 4h por CPF
      const MAX_DIFF_MIN = 240; // 4 horas
      const byCpf = new Map<string, any[]>();
      rows.forEach((r: any) => {
        const cpf = r.pat_cpf || 'SEM_CPF';
        if (!byCpf.has(cpf)) byCpf.set(cpf, []);
        byCpf.get(cpf)!.push(r);
      });
      // Ordena por executed_date_time dentro de cada CPF
      for (const list of byCpf.values()) {
        list.sort((a: any, b: any) => new Date(a.executed_date_time).getTime() - new Date(b.executed_date_time).getTime());
      }

      const confirmWaits: number[] = [];
      const medWaits: number[] = [];
      const totalChainMinutes: number[] = [];
      const confirmServiceMins: number[] = [];
      const medServiceMins: number[] = [];

      for (const list of byCpf.values()) {
        // percorre confirmações e acha a próxima consulta médica no limite de 4h
        const confs = list.filter((c: any) => isDados(c.appointment_specialty));
        for (const conf of confs) {
          const confExec = conf.executed_date_time ? new Date(conf.executed_date_time) : null;
          const confSched = conf.schedule_date_time ? new Date(conf.schedule_date_time) : null;
          if (!confExec || !confSched) continue;

          const nextMedical = list
            .filter((c: any) => !isDados(c.appointment_specialty) && c.executed_date_time && new Date(c.executed_date_time) > confExec)
            .filter((c: any) => {
              const diffSec = (new Date(c.executed_date_time).getTime() - confExec.getTime()) / 1000;
              return diffSec <= MAX_DIFF_MIN * 60;
            })
            .sort((a: any, b: any) => new Date(a.executed_date_time).getTime() - new Date(b.executed_date_time).getTime())[0];

          if (!nextMedical) continue;

          const esperaHelpDesk = this.minutesBetween(conf.schedule_date_time, conf.executed_date_time) ?? 0;
          const atendimentoHelpDesk = conf.total_appointment_time != null ? Number(conf.total_appointment_time) / 60 : 0; // seg->min
          const esperaMedica = this.minutesBetween(conf.executed_date_time, nextMedical.executed_date_time) ?? 0;
          const medRaw = nextMedical.resume_total_time != null
            ? Number(nextMedical.resume_total_time)
            : (nextMedical.total_appointment_time != null ? Number(nextMedical.total_appointment_time) : 0);
          const atendimentoMedico = medRaw ? medRaw / 60 : 0; // seg->min

          confirmWaits.push(esperaHelpDesk);
          medWaits.push(esperaMedica);
          confirmServiceMins.push(atendimentoHelpDesk);
          medServiceMins.push(atendimentoMedico);
          totalChainMinutes.push(esperaHelpDesk + atendimentoHelpDesk + esperaMedica + atendimentoMedico);
        }
      }

      // Contagens alinhadas com os KPIs (mesma regra de filtro do stats)
      const [rowMed, rowConf, rowTotal] = await Promise.all([
        this.appointmentRepository.query(
          `SELECT COUNT(*) AS total_medicas
           FROM appointments a
           WHERE a.company_id = ? 
             AND a.executed_date_time IS NOT NULL
             AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
             AND (a.appointment_specialty IS NULL OR LOWER(TRIM(a.appointment_specialty)) NOT LIKE '%dados%')`,
          [companyId, startDate, endDate]
        ),
        this.appointmentRepository.query(
          `SELECT COUNT(*) AS total_confirmacoes
           FROM appointments a
           WHERE a.company_id = ? 
             AND a.executed_date_time IS NOT NULL
             AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
             AND (a.appointment_specialty IS NOT NULL AND LOWER(TRIM(a.appointment_specialty)) LIKE '%dados%')`,
          [companyId, startDate, endDate]
        ),
        this.appointmentRepository.query(
          `SELECT COUNT(*) AS total
           FROM appointments a
           WHERE a.company_id = ? 
             AND a.executed_date_time IS NOT NULL
             AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?`,
          [companyId, startDate, endDate]
        ),
      ]);

      const counts = {
        total: Number(rowTotal?.[0]?.total || 0),
        medicas: Number(rowMed?.[0]?.total_medicas || 0),
        confirmacoes: Number(rowConf?.[0]?.total_confirmacoes || 0),
      };

      // Acrescentar contagens de receitas e atestados para preencher KPIs exclusivamente via wait-times
      try {
        const [totalPrescriptions, totalCertificates] = await Promise.all([
          this.getTotalPrescriptions(companyId, startDate, endDate),
          this.getTotalCertificates(companyId, startDate, endDate),
        ]);
        (counts as any).receitas = Number(totalPrescriptions || 0);
        (counts as any).atestados = Number(totalCertificates || 0);
      } catch (e) {
        // Mantém compatibilidade mesmo se consultas auxiliares falharem
        (counts as any).receitas = (counts as any).receitas ?? 0;
        (counts as any).atestados = (counts as any).atestados ?? 0;
      }

      // Distribuições com timezone consistente (UTC-3) via SQL helpers
      const [dayOfWeek, hourOfDay] = await Promise.all([
        this.getDayOfWeekSummary(companyId, startDate, endDate),
        this.getHourOfDaySummary(companyId, startDate, endDate),
      ]);

      // Top médicos e especialidades
      const topDoctors = await this.appointmentRepository.query(
        `SELECT 
           COALESCE(NULLIF(TRIM(ap.council_number),''), NULLIF(TRIM(ap.cpf),''), ap.name) AS doctor_id,
           ap.name AS doctor_name, 
           COUNT(DISTINCT a.id) AS appointments
         FROM appointment_participants ap
         INNER JOIN appointments a ON a.id = ap.appointment_id AND a.company_id = ap.company_id
         WHERE ap.company_id = ?
           AND ap.role = 'MMD'
           AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
           AND (a.appointment_specialty IS NULL OR a.appointment_specialty NOT LIKE '%dados%')
           AND (
             a.status_appointment IS NULL OR 
             LOWER(TRIM(a.status_appointment)) NOT IN ('cancelled','canceled','rescheduled','reagendado','reagendada')
           )
         GROUP BY doctor_id, ap.name
         ORDER BY appointments DESC
         LIMIT 10`,
        [companyId, startDate, endDate]
      );
      const topSpecialties = await this.appointmentRepository.query(
        `SELECT a.appointment_specialty AS name, COUNT(*) AS count
         FROM appointments a
         WHERE a.company_id = ?
           AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
           AND (a.appointment_specialty IS NULL OR a.appointment_specialty NOT LIKE '%dados%')
         GROUP BY a.appointment_specialty
         ORDER BY COUNT(*) DESC
         LIMIT 10`,
        [companyId, startDate, endDate]
      );

      const payload = {
        counts,
        dayOfWeek,
        hourOfDay,
        waitTimes: {
          covered_total_time: totalChainMinutes.length,
          avg_total_time_minutes: this.average(totalChainMinutes),
          confirmation: {
            covered: confirmWaits.length,
            avg_minutes: this.average(confirmWaits),
          },
          medical: {
            covered: medWaits.length,
            avg_minutes: this.average(medWaits),
          },
        },
        serviceTimes: {
          confirmationMinutes: this.median(confirmServiceMins.length ? confirmServiceMins : confirmDurations),
          medicalMinutes: this.median(medServiceMins.length ? medServiceMins : medDurations),
        },
        topDoctors: topDoctors.map((r: any) => ({ doctor_name: r.doctor_name, appointments: Number(r.appointments) })),
        topSpecialties: topSpecialties.map((r: any) => ({ name: r.name ?? 'Sem especialidade', count: Number(r.count) })),
      };

      return { company_id: companyId, period: { from: startDate, to: endDate }, ...payload };
    } catch (error) {
      console.error('Erro em getWaitTimesFromAppointments:', error);
      throw error;
    }
  }

  /**
   * Métricas de tempos de espera com base em protocols e protocol_history
   * - Tempo de espera do paciente: arrival_time -> primeiro FLOW_ON_ATTENDANCE
   * - Tempo de espera do médico: FLOW_PROFESSIONAL_READY_TO_ATTEND -> FLOW_ON_ATTENDANCE
   * - Tempo total de atendimento: FLOW_ON_ATTENDANCE -> FLOW_PROFESSIONAL_END_ATTENDANCE
   */
  async getProtocolWaitTimes(companyId: number, startDate: string, endDate: string) {
    const query = `
    SELECT 
      COUNT(DISTINCT p.id) AS total_protocols,

      -- CONFIRMAÇÃO DE DADOS
      COUNT(DISTINCT cd.protocol_id) AS covered_data_confirmation_wait,
      ROUND(AVG(cd.diff_minutes), 2) AS avg_data_confirmation_wait_minutes,

      -- CONSULTÓRIO MÉDICO
      COUNT(DISTINCT cm.protocol_id) AS covered_consultation_room_wait,
      ROUND(AVG(cm.diff_minutes), 2) AS avg_consultation_room_wait_minutes,

      -- TEMPO TOTAL (CONFIRMAÇÃO + CONSULTÓRIO)
      COUNT(DISTINCT CASE 
        WHEN cd.diff_minutes IS NOT NULL 
         AND cm.diff_minutes IS NOT NULL 
        THEN p.id 
      END) AS covered_total_time,
      ROUND(AVG(
        CASE 
          WHEN cd.diff_minutes IS NOT NULL 
           AND cm.diff_minutes IS NOT NULL 
          THEN cd.diff_minutes + cm.diff_minutes
        END
      ), 2) AS avg_total_time_minutes

    FROM protocols p

    -- ponto de ancoragem de chegada (fallback quando p.arrival_time é nulo)
    LEFT JOIN (
      SELECT 
        protocol_id,
        MIN(ts) AS arrival_ts
      FROM protocol_history
      WHERE step IN ('FLOW_PERSON_ARRIVAL', 'PERSON_ENTER_EMERGENCY')
      GROUP BY protocol_id
    ) arr ON arr.protocol_id = p.id

    

    LEFT JOIN (
      SELECT 
        ph.protocol_id,
        MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END) AS wait_ts,
        MIN(CASE WHEN ph2.step = 'FLOW_PERSON_READY_TO_BE_ATTENDED' THEN ph2.ts END) AS ready_ts,
        CASE 
          WHEN MIN(CASE WHEN ph2.step = 'FLOW_PERSON_READY_TO_BE_ATTENDED' THEN ph2.ts END) 
               > MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END)
          THEN TIMESTAMPDIFF(
                 MINUTE,
                 MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END),
                 MIN(CASE WHEN ph2.step = 'FLOW_PERSON_READY_TO_BE_ATTENDED' THEN ph2.ts END)
               )
          ELSE NULL
        END AS diff_minutes
      FROM protocol_history ph
      JOIN protocol_history ph2 
        ON ph.protocol_id = ph2.protocol_id
       AND ph2.ts > ph.ts
      WHERE ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP'
        AND (
          LOWER(TRIM(ph.next_group)) LIKE '%confirm%'
          OR LOWER(TRIM(ph.next_group)) LIKE '%dados%'
          OR TRIM(ph.next_group) = 'Confirmação de Dados'
        )
        AND ph2.step IN ('FLOW_PERSON_READY_TO_BE_ATTENDED', 'PERSON_START_ATTENDANCE', 'FLOW_ON_ATTENDANCE')
      GROUP BY ph.protocol_id
    ) cd ON cd.protocol_id = p.id

    

    LEFT JOIN (
      SELECT 
        ph.protocol_id,
        MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END) AS wait_ts,
        MIN(CASE WHEN ph2.step = 'FLOW_ON_ATTENDANCE' THEN ph2.ts END) AS ready_ts,
        CASE 
          WHEN MIN(CASE WHEN ph2.step = 'FLOW_ON_ATTENDANCE' THEN ph2.ts END) 
               > MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END)
          THEN TIMESTAMPDIFF(
                 MINUTE,
                 MIN(CASE WHEN ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP' THEN ph.ts END),
                 MIN(CASE WHEN ph2.step = 'FLOW_ON_ATTENDANCE' THEN ph2.ts END)
               )
          ELSE NULL
        END AS diff_minutes
      FROM protocol_history ph
      JOIN protocol_history ph2 
        ON ph.protocol_id = ph2.protocol_id
       AND ph2.ts > ph.ts
      WHERE ph.step = 'FLOW_PERSON_WAITING_NEXT_GROUP'
        AND (
          LOWER(TRIM(ph.next_group)) LIKE '%consult%'
          OR TRIM(ph.next_group) = 'Consultório'
        )
        AND ph2.step IN ('FLOW_ON_ATTENDANCE', 'PERSON_START_ATTENDANCE')
      GROUP BY ph.protocol_id
    ) cm ON cm.protocol_id = p.id

    

    WHERE p.company_id = ?
      AND DATE(
        CONVERT_TZ(
          COALESCE(
            p.arrival_time,
            arr.arrival_ts,
            cd.wait_ts,
            cm.wait_ts
          ), '+00:00', '-03:00')
      ) BETWEEN ? AND ?;
  `;

    try {
      const [stats] = await this.protocolRepository.query(query, [companyId, startDate, endDate]);

      // Tratamento de segurança (garante que o front nunca receba undefined)
      const safe = (v: any) => (v !== null && !isNaN(v) ? Number(v) : 0);

      return {
        total_protocols: safe(stats.total_protocols),
        covered_data_confirmation_wait: safe(stats.covered_data_confirmation_wait),
        avg_data_confirmation_wait_minutes: safe(stats.avg_data_confirmation_wait_minutes),
        covered_consultation_room_wait: safe(stats.covered_consultation_room_wait),
        avg_consultation_room_wait_minutes: safe(stats.avg_consultation_room_wait_minutes),
        covered_total_time: safe(stats.covered_total_time),
        avg_total_time_minutes: safe(stats.avg_total_time_minutes),
      };
    } catch (error: any) {
      console.error('❌ Erro ao calcular tempos de espera:', error);
      throw error;
    }
  }

  private calculateWeekdayOccurrences(startDate: string, endDate: string): Record<number, number> {
    // Conta ocorrências por dia da semana no período considerando timezone do Brasil (UTC-3)
    const occurrences: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    // Anchora as datas em UTC-3 para evitar deslocamentos de fuso
    let current = new Date(`${startDate}T00:00:00-03:00`);
    const end = new Date(`${endDate}T00:00:00-03:00`);

    while (current.getTime() <= end.getTime()) {
      // getUTCDay sobre uma data criada com -03:00 mantém a semana correta no fuso Brasil
      const weekday = current.getUTCDay(); // 0 (domingo) ... 6 (sábado)
      const mysqlWeekday = weekday === 0 ? 1 : weekday + 1; // compatível com DAYOFWEEK (1=domingo..7=sábado)
      occurrences[mysqlWeekday] = (occurrences[mysqlWeekday] || 0) + 1;
      // avança um dia em UTC para não sofrer DST local
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    return occurrences;
  }

  private getWeekdayLabel(weekday: number) {
    const labels: Record<number, string> = {
      1: 'Domingo',
      2: 'Segunda-feira',
      3: 'Terça-feira',
      4: 'Quarta-feira',
      5: 'Quinta-feira',
      6: 'Sexta-feira',
      7: 'Sábado',
    };
    return labels[weekday] || `Dia ${weekday}`;
  }

  async getDayOfWeekSummary(companyId: number, startDate: string, endDate: string) {
    try {
      const query = `
        SELECT 
          DAYOFWEEK(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) AS weekday,
          COUNT(*) AS total
        FROM appointments a
        WHERE a.company_id = ?
          AND a.executed_date_time IS NOT NULL
          AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
          AND (a.appointment_specialty IS NULL OR LOWER(TRIM(a.appointment_specialty)) NOT LIKE '%dados%')
        GROUP BY weekday
        ORDER BY weekday
      `;

      const rows = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      const occurrences = this.calculateWeekdayOccurrences(startDate, endDate);

      return rows.map((row: any) => {
        const weekday = Number(row.weekday);
        const total = Number(row.total) || 0;
        const divisor = occurrences[weekday] || 1;
        return {
          weekday,
          label: this.getWeekdayLabel(weekday),
          total,
          days_in_period: divisor,
          average_per_day: Number((total / divisor).toFixed(2)),
        };
      });
    } catch (error) {
      console.error('Erro ao calcular distribui��ǜo semanal:', error);
      return [];
    }
  }

  async getHourOfDaySummary(companyId: number, startDate: string, endDate: string) {
    try {
      const query = `
        SELECT 
          HOUR(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) AS hour,
          COUNT(*) AS total
        FROM appointments a
        WHERE a.company_id = ?
          AND a.executed_date_time IS NOT NULL
          AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
          AND (a.appointment_specialty IS NULL OR LOWER(TRIM(a.appointment_specialty)) NOT LIKE '%dados%')
        GROUP BY hour
        ORDER BY hour
      `;

      const rows = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      return rows.map((row: any) => ({
        hour: Number(row.hour),
        label: `${String(row.hour).padStart(2, '0')}:00`,
        total: Number(row.total) || 0,
      }));
    } catch (error) {
      console.error('Erro ao calcular distribui��ǜo hor��ria:', error);
      return [];
    }
  }

  async getAverageServiceTimes(companyId: number, startDate: string, endDate: string) {
    try {
      const query = `
        SELECT 
          AVG(CASE WHEN appointment_specialty LIKE '%dados%' THEN total_appointment_time END) AS confirmation_seconds,
          AVG(CASE WHEN appointment_specialty IS NULL OR appointment_specialty NOT LIKE '%dados%' THEN total_appointment_time END) AS medical_seconds
        FROM appointments
        WHERE company_id = ?
          AND executed_date_time IS NOT NULL
          AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
      `;

      const [row] = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      const toMinutes = (seconds?: number) =>
        seconds && !isNaN(Number(seconds)) ? Number((Number(seconds) / 60).toFixed(2)) : 0;

      return {
        confirmationMinutes: toMinutes(row?.confirmation_seconds),
        medicalMinutes: toMinutes(row?.medical_seconds),
      };
    } catch (error) {
      console.error('Erro ao calcular tempos m��dios de atendimento:', error);
      return {
        confirmationMinutes: 0,
        medicalMinutes: 0,
      };
    }
  }

  async getCompanyAggregates(startDate: string, endDate: string, limit = 5) {
    try {
      const volumeQuery = `
        SELECT 
          c.id,
          c.name,
          COUNT(*) AS total_appointments
        FROM appointments a
        JOIN companies c ON c.id = a.company_id
        WHERE a.executed_date_time IS NOT NULL
          AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        GROUP BY c.id, c.name
        ORDER BY total_appointments DESC
        LIMIT ?
      `;

      const waitQuery = `
        SELECT 
          c.id,
          c.name,
          ROUND(AVG(TIMESTAMPDIFF(MINUTE, p.arrival_time, p.start_attendance)), 2) AS avg_wait_minutes,
          COUNT(*) AS total_protocols
        FROM protocols p
        JOIN companies c ON c.id = p.company_id
        WHERE p.arrival_time IS NOT NULL
          AND p.start_attendance IS NOT NULL
          AND DATE(p.arrival_time) BETWEEN ? AND ?
        GROUP BY c.id, c.name
        HAVING total_protocols > 0
        ORDER BY avg_wait_minutes DESC
        LIMIT ?
      `;

      const [topByVolume, topByWait] = await Promise.all([
        this.appointmentRepository.query(volumeQuery, [startDate, endDate, limit]),
        this.protocolRepository.query(waitQuery, [startDate, endDate, limit]),
      ]);

      return {
        topByVolume: topByVolume.map((row: any) => ({
          company_id: Number(row.id),
          company_name: row.name,
          total_appointments: Number(row.total_appointments) || 0,
        })),
        topByWait: topByWait.map((row: any) => ({
          company_id: Number(row.id),
          company_name: row.name,
          avg_wait_minutes: Number(row.avg_wait_minutes) || 0,
          total_protocols: Number(row.total_protocols) || 0,
        })),
      };
    } catch (error) {
      console.error('Erro ao calcular indicadores por empresa:', error);
      return {
        topByVolume: [],
        topByWait: [],
      };
    }
  }

  async getComprehensiveIndicators(companyId: number, startDate: string, endDate: string) {
    try {
      const [
        dayOfWeek,
        hourOfDay,
        waitTimes,
        serviceTimes,
        topDoctors,
        topSpecialties,
        topCid10,
        companyAggregates,
      ] = await Promise.all([
        this.getDayOfWeekSummary(companyId, startDate, endDate),
        this.getHourOfDaySummary(companyId, startDate, endDate),
        this.getProtocolWaitTimes(companyId, startDate, endDate),
        this.getAverageServiceTimes(companyId, startDate, endDate),
        this.getTopDoctors(companyId, startDate, endDate),
        this.getTopSpecialties(companyId, startDate, endDate),
        this.getTopCID10(companyId, startDate, endDate),
        this.getCompanyAggregates(startDate, endDate),
      ]);

      return {
        dayOfWeek,
        hourOfDay,
        waitTimes,
        serviceTimes,
        topDoctors,
        topSpecialties,
        topCid10,
        companyAggregates,
      };
    } catch (error) {
      console.error('Erro ao montar indicadores completos:', error);
      return {
        dayOfWeek: [],
        hourOfDay: [],
        waitTimes: null,
        serviceTimes: null,
        topDoctors: [],
        topSpecialties: [],
        topCid10: [],
        companyAggregates: {
          topByVolume: [],
          topByWait: [],
        },
      };
    }
  }

  async getTopCID10(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT 
        cid10_value,
        COUNT(*) as count
      FROM appointments
      WHERE company_id = ? 
        AND executed_date_time IS NOT NULL
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND cid10_value IS NOT NULL 
        AND cid10_value != ''
      GROUP BY cid10_value
      ORDER BY count DESC
      LIMIT 10
    `;

    return await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
  }

  async getWeeklyData(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT 
        CASE DAYOFWEEK(CONVERT_TZ(executed_date_time, '+00:00', '-03:00'))
          WHEN 1 THEN 'Domingo'
          WHEN 2 THEN 'Segunda'
          WHEN 3 THEN 'Terça'
          WHEN 4 THEN 'Quarta'
          WHEN 5 THEN 'Quinta'
          WHEN 6 THEN 'Sexta'
          WHEN 7 THEN 'Sábado'
          ELSE 'N/A'
        END as dia_nome,
        COUNT(*) as mes_atual
      FROM appointments
      WHERE company_id = ? 
        AND executed_date_time IS NOT NULL
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND (appointment_specialty IS NULL OR LOWER(TRIM(appointment_specialty)) NOT LIKE '%dados%')
      GROUP BY DAYOFWEEK(CONVERT_TZ(executed_date_time, '+00:00', '-03:00'))
      ORDER BY DAYOFWEEK(CONVERT_TZ(executed_date_time, '+00:00', '-03:00'))
    `;

    return await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
  }

  async getHourlyData(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT 
        HOUR(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) as hora,
        COUNT(*) as mes_atual
      FROM appointments
      WHERE company_id = ? 
        AND executed_date_time IS NOT NULL
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND (appointment_specialty IS NULL OR LOWER(TRIM(appointment_specialty)) NOT LIKE '%dados%')
      GROUP BY HOUR(CONVERT_TZ(executed_date_time, '+00:00', '-03:00'))
      ORDER BY hora
    `;

    return await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
  }

  async getTotalAppointments(companyId: number, startDate: string, endDate: string) {
    try {
      const query = `
        SELECT COUNT(*) as total
        FROM appointments a
        WHERE a.company_id = ? 
          AND a.executed_date_time IS NOT NULL
          AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
          AND (a.appointment_specialty IS NULL OR LOWER(TRIM(a.appointment_specialty)) NOT LIKE '%dados%')
      `;

      const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      return result[0]?.total || 0;
    } catch (error) {
      console.error('Erro ao buscar total de atendimentos:', error);
      return 0;
    }
  }

  async getTotalDoctors(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT COUNT(DISTINCT ap.name) as total
      FROM appointment_participants ap
      INNER JOIN appointments a ON ap.appointment_id = a.id
      WHERE a.company_id = ? 
        AND ap.role = 'doctor'
        AND DATE(CONVERT_TZ(a.executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND ap.name IS NOT NULL 
        AND ap.name != ''
        AND a.appointment_specialty NOT LIKE '%dados%'
    `;

    const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
    return result[0]?.total || 0;

  }

  async getAverageAppointmentTime(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT AVG(total_appointment_time) as average
      FROM appointments
      WHERE company_id = ? 
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND total_appointment_time IS NOT NULL
        AND total_appointment_time > 0
        AND (appointment_specialty IS NULL OR appointment_specialty NOT LIKE '%dados%')
    `;

    const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
    const averageInSeconds = result[0]?.average || 0;
    // Converter de segundos para minutos
    return Math.round(averageInSeconds / 60 * 10) / 10; // Arredonda para 1 casa decimal
  }
  async getTopSpecialties(companyId: number, startDate: string, endDate: string) {
    const query = `
      SELECT 
        appointment_specialty as name,
        COUNT(*) as count
      FROM appointments
      WHERE company_id = ? 
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND appointment_specialty IS NOT NULL 
        AND appointment_specialty != ''
        AND appointment_specialty != 'Confirmação de Dados'
      GROUP BY appointment_specialty
      ORDER BY count DESC
      LIMIT 5
    `;

    // Resiliência: tenta novamente se houver queda pontual de conexão
    return await this.runQueryWithRetry(query, [companyId, startDate, endDate]);
  }

  private async runQueryWithRetry<T = any>(query: string, params: any[], attempts = 2): Promise<T> {
    let lastError: any;
    for (let i = 0; i < attempts; i++) {
      try {
        // Usa o repositório para executar a query; em caso de queda, tenta novamente
        return await this.appointmentRepository.query(query, params);
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'PROTOCOL_CONNECTION_LOST' && i < attempts - 1) {
          // Aguardar um breve período antes de tentar reconectar
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async getTotalUsers(companyId: number) {
    try {
      const result = await this.userRepository.count({
        where: { company_id: companyId, is_active: true }
      });
      return result;
    } catch (error) {
      console.error('Erro ao buscar total de usuários:', error);
      return 0;
    }
  }

  async getMonthlyComparison(companyId: number) {
    try {
      const now = new Date();
      const currentMonthIndex = now.getMonth(); // 0-11
      const currentYear = now.getFullYear();

      // Números de mês/ano para retorno
      const currentMonthNumber = currentMonthIndex + 1; // 1-12
      const previousMonthIndex = (currentMonthIndex + 11) % 12; // 0-11
      const previousMonthNumber = previousMonthIndex + 1; // 1-12
      const previousYear = previousMonthIndex === 11 ? currentYear - 1 : currentYear;

      // Mês atual: início e fim corretos
      const currentMonthStartDate = new Date(currentYear, currentMonthIndex, 1);
      const currentMonthEndDate = new Date(currentYear, currentMonthIndex + 1, 0); // último dia do mês
      const currentMonthStart = `${currentMonthStartDate.getFullYear()}-${(currentMonthStartDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
      const currentMonthEnd = `${currentMonthEndDate.getFullYear()}-${(currentMonthEndDate.getMonth() + 1).toString().padStart(2, '0')}-${currentMonthEndDate.getDate().toString().padStart(2, '0')}`;

      // Mês anterior: início e fim corretos
      const previousMonthEndDate = new Date(currentYear, currentMonthIndex, 0); // último dia do mês anterior
      const previousMonthStartDate = new Date(previousMonthEndDate.getFullYear(), previousMonthEndDate.getMonth(), 1);
      const previousMonthStart = `${previousMonthStartDate.getFullYear()}-${(previousMonthStartDate.getMonth() + 1).toString().padStart(2, '0')}-01`;
      const previousMonthEnd = `${previousMonthEndDate.getFullYear()}-${(previousMonthEndDate.getMonth() + 1).toString().padStart(2, '0')}-${previousMonthEndDate.getDate().toString().padStart(2, '0')}`;

      // Buscar dados básicos do mês atual
      const [
        currentAppointments,
        currentPrescriptions,
        currentCertificates,
        currentDoctors,
        currentTopDoctors,
        currentTopSpecialties,
        currentWeeklyData,
        currentHourlyData,
        currentProtocolWaitTimes
      ] = await Promise.all([
        this.getTotalAppointments(companyId, currentMonthStart, currentMonthEnd),
        this.getTotalPrescriptions(companyId, currentMonthStart, currentMonthEnd),
        this.getTotalCertificates(companyId, currentMonthStart, currentMonthEnd),
        this.getTotalDoctors(companyId, currentMonthStart, currentMonthEnd),
        this.getTopDoctors(companyId, currentMonthStart, currentMonthEnd),
        this.getTopSpecialties(companyId, currentMonthStart, currentMonthEnd),
        this.getWeeklyData(companyId, currentMonthStart, currentMonthEnd),
        this.getHourlyData(companyId, currentMonthStart, currentMonthEnd),
        this.getProtocolWaitTimes(companyId, currentMonthStart, currentMonthEnd)
      ]);

      // Buscar dados básicos do mês anterior
      const [
        previousAppointments,
        previousPrescriptions,
        previousCertificates,
        previousDoctors,
        previousTopDoctors,
        previousTopSpecialties,
        previousWeeklyData,
        previousHourlyData,
        previousProtocolWaitTimes
      ] = await Promise.all([
        this.getTotalAppointments(companyId, previousMonthStart, previousMonthEnd),
        this.getTotalPrescriptions(companyId, previousMonthStart, previousMonthEnd),
        this.getTotalCertificates(companyId, previousMonthStart, previousMonthEnd),
        this.getTotalDoctors(companyId, previousMonthStart, previousMonthEnd),
        this.getTopDoctors(companyId, previousMonthStart, previousMonthEnd),
        this.getTopSpecialties(companyId, previousMonthStart, previousMonthEnd),
        this.getWeeklyData(companyId, previousMonthStart, previousMonthEnd),
        this.getHourlyData(companyId, previousMonthStart, previousMonthEnd),
        this.getProtocolWaitTimes(companyId, previousMonthStart, previousMonthEnd)
      ]);

      // Calcular percentuais de crescimento
      const calculateGrowthPercentage = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Number(((current - previous) / previous * 100).toFixed(2));
      };

      return {
        periodo: {
          mesAtual: {
            mes: currentMonthNumber,
            ano: currentYear,
            inicio: currentMonthStart,
            fim: currentMonthEnd
          },
          mesAnterior: {
            mes: previousMonthNumber,
            ano: previousYear,
            inicio: previousMonthStart,
            fim: previousMonthEnd
          }
        },
        indicadores: {
          atendimentos: {
            mesAtual: currentAppointments,
            mesAnterior: previousAppointments,
            diferenca: currentAppointments - previousAppointments,
            percentual: calculateGrowthPercentage(currentAppointments, previousAppointments)
          },
          receitas: {
            mesAtual: currentPrescriptions,
            mesAnterior: previousPrescriptions,
            diferenca: currentPrescriptions - previousPrescriptions,
            percentual: calculateGrowthPercentage(currentPrescriptions, previousPrescriptions)
          },
          atestados: {
            mesAtual: currentCertificates,
            mesAnterior: previousCertificates,
            diferenca: currentCertificates - previousCertificates,
            percentual: calculateGrowthPercentage(currentCertificates, previousCertificates)
          },
          medicos: {
            mesAtual: currentDoctors,
            mesAnterior: previousDoctors,
            diferenca: currentDoctors - previousDoctors,
            percentual: calculateGrowthPercentage(currentDoctors, previousDoctors)
          },
          tempoEsperaProtocolo: {
            mesAtual: currentProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0,
            mesAnterior: previousProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0,
            diferenca: (currentProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0) - (previousProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0),
            percentual: calculateGrowthPercentage(
              currentProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0,
              previousProtocolWaitTimes?.avg_data_confirmation_wait_minutes || 0
            )
          },
          tempoEsperaConsulta: {
            mesAtual: currentProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0,
            mesAnterior: previousProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0,
            diferenca: (currentProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0) - (previousProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0),
            percentual: calculateGrowthPercentage(
              currentProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0,
              previousProtocolWaitTimes?.avg_consultation_room_wait_minutes || 0
            )
          }
        },
        graficos: {
          topMedicos: {
            mesAtual: currentTopDoctors,
            mesAnterior: previousTopDoctors
          },
          topEspecialidades: {
            mesAtual: currentTopSpecialties,
            mesAnterior: previousTopSpecialties
          },
          dadosSemanais: {
            mesAtual: currentWeeklyData,
            mesAnterior: previousWeeklyData
          },
          dadosHorarios: {
            mesAtual: currentHourlyData,
            mesAnterior: previousHourlyData
          }
        }
      };
    } catch (error) {
      console.error('Erro ao buscar comparação mensal:', error);
      return {
        periodo: {
          mesAtual: { mes: 0, ano: 0, inicio: '', fim: '' },
          mesAnterior: { mes: 0, ano: 0, inicio: '', fim: '' }
        },
        indicadores: {
          atendimentos: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 },
          receitas: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 },
          atestados: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 },
          medicos: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 },
          tempoEsperaProtocolo: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 },
          tempoEsperaConsulta: { mesAtual: 0, mesAnterior: 0, diferenca: 0, percentual: 0 }
        },
        graficos: {
          topMedicos: { mesAtual: [], mesAnterior: [] },
          topEspecialidades: { mesAtual: [], mesAnterior: [] },
          dadosSemanais: { mesAtual: [], mesAnterior: [] },
          dadosHorarios: { mesAtual: [], mesAnterior: [] }
        }
      };
    }
  }
  async getTotalPrescriptions(companyId: number, startDate: string, endDate: string) {
    try {
      const query = `
        SELECT COUNT(*) as total
        FROM files f
        JOIN appointments a ON f.appointment_id = a.id
        WHERE f.company_id = ? 
          AND f.name_original LIKE '%receita%'
          AND f.file_date IS NOT NULL
          AND DATE(CONVERT_TZ(f.file_date, '+00:00', '-03:00')) BETWEEN ? AND ?
      `;

      const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
      return result[0]?.total || 0;
    } catch (error) {
      console.error('Erro ao buscar total de receitas:', error);
      return 0;
    }
  }
  async getTotalCertificates(companyId: number, startDate: string, endDate: string) {
      try {
        const query = `
        SELECT COUNT(*) as total
        FROM files f
        JOIN appointments a ON f.appointment_id = a.id
        WHERE f.company_id = ? 
          AND f.name_original LIKE '%atestado%'
          AND f.file_date IS NOT NULL
          AND DATE(CONVERT_TZ(f.file_date, '+00:00', '-03:00')) BETWEEN ? AND ?
      `;

        const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
        return result[0]?.total || 0;
      } catch (error) {
        console.error('Erro ao buscar total de atestados:', error);
        return 0;
      }
    }
  async getGrowthPercentage(companyId: number, startDate: string, endDate: string) {
        // Calcular período anterior com a mesma duração
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - diffDays);
        const previousEnd = new Date(start);
        previousEnd.setDate(previousEnd.getDate() - 1);

        const currentQuery = `
      SELECT COUNT(*) as total
      FROM appointments
      WHERE company_id = ? 
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND executed_date_time IS NOT NULL
    `;

        const previousQuery = `
      SELECT COUNT(*) as total
      FROM appointments
      WHERE company_id = ? 
        AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
        AND executed_date_time IS NOT NULL
    `;

        const [currentResult, previousResult] = await Promise.all([
          this.appointmentRepository.query(currentQuery, [companyId, startDate, endDate]),
          this.appointmentRepository.query(previousQuery, [
            companyId,
            previousStart.toISOString().split('T')[0],
            previousEnd.toISOString().split('T')[0]
          ])
        ]);

        const currentTotal = currentResult[0]?.total || 0;
        const previousTotal = previousResult[0]?.total || 0;

        if (previousTotal === 0) return 0;

        return Math.round(((currentTotal - previousTotal) / previousTotal) * 100);
      }

  async getTotalDataConfirmations(companyId: number, startDate: string, endDate: string) {
        try {
          const query = `
        SELECT COUNT(*) as total
        FROM appointments
        WHERE company_id = ? 
          AND DATE(CONVERT_TZ(executed_date_time, '+00:00', '-03:00')) BETWEEN ? AND ?
          AND appointment_specialty LIKE '%dados%'
          AND executed_date_time IS NOT NULL
      `;

          const result = await this.appointmentRepository.query(query, [companyId, startDate, endDate]);
          return result[0]?.total || 0;
        } catch (error) {
          console.error('Erro ao buscar total de confirmações de dados:', error);
          return 0;
        }
      }
    }
