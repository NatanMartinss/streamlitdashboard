import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { ProtocolEvent, Appointment, AppointmentParticipant, Company } from '../entities';
import { CreateProtocolEventDto } from './dto/create-protocol-event.dto';
import { RealtimeGateway } from './realtime.gateway';

export interface HourlyAttendancePoint {
  hour: string;
  total: number;
}

interface QueueProtocol {
  protocol?: string;
  appointmentId?: string;
  name?: string;
  cpf?: string;
  nextGroup?: string;
  status: 'waiting' | 'ready' | 'in_attendance';
  lastEvent: string;
  lastUpdate: Date;
  waitingSince?: Date;
  minutesSinceLastUpdate: number;
  companyId?: number;
  companyName?: string;
}

@Injectable()
export class RealtimeService {
  constructor(
    @InjectRepository(ProtocolEvent)
    private readonly protocolEventRepository: Repository<ProtocolEvent>,
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectRepository(AppointmentParticipant)
    private readonly participantRepository: Repository<AppointmentParticipant>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private applyCompanyFilter<T extends SelectQueryBuilder<ProtocolEvent>>(
    qb: T,
    companyId?: number,
    companyKey?: string,
  ): T {
    if (companyId) {
      qb.andWhere('event.companyId = :companyId', { companyId });
    } else if (companyKey) {
      qb.andWhere('event.companyKey = :companyKey', { companyKey });
    }
    return qb;
  }

  async recordEvent(dto: CreateProtocolEventDto) {
    const timestamp = dto.timestamp ? new Date(dto.timestamp) : new Date();

    const event = this.protocolEventRepository.create({
      companyId: dto.company_id,
      companyKey: dto.company_key,
      companyName: dto.company_name,
      appointmentId: dto.appointment_id,
      protocol: dto.protocol,
      participantId: dto.participant_id,
      cpf: dto.cpf,
      name: dto.name,
      event: dto.event,
      nextGroup: dto.next_group,
      professionalId: dto.professional_id,
      professionalName: dto.professional_name,
      professionalLicense: dto.professional_license,
      timestamp,
      payload: dto.payload,
    });

    const saved = await this.protocolEventRepository.save(event);
    this.realtimeGateway.broadcastEvent(saved);
    return saved;
  }

  async getHourlyAttendance(
    companyId?: number,
    companyKey?: string,
    hours = 12,
  ): Promise<HourlyAttendancePoint[]> {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .select("DATE_FORMAT(event.timestamp, '%Y-%m-%d %H:00:00')", 'hour')
        .addSelect('COUNT(*)', 'total')
        .where('event.event = :eventType', { eventType: 'PERSON_START_ATTENDANCE' })
        .andWhere('event.timestamp >= :cutoff', { cutoff })
        .groupBy("DATE_FORMAT(event.timestamp, '%Y-%m-%d %H')")
        .orderBy('hour', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const raw = await qb.getRawMany<{ hour: string; total: string }>();
      return raw.map((row) => ({
        hour: row.hour,
        total: Number(row.total) || 0,
      }));
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return [];
      }
      throw err;
    }
  }

  async getRecentEvents(
    companyId?: number,
    companyKey?: string,
    limit = 25,
  ) {
    try {
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .orderBy('event.timestamp', 'DESC')
        .limit(limit);

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
      return events.map((event) => ({
        id: event.id,
        protocol: event.protocol,
        appointmentId: event.appointmentId,
        name: event.name,
        event: event.event,
        nextGroup: event.nextGroup,
        timestamp: event.timestamp,
        companyId: event.companyId,
        companyKey: event.companyKey,
      }));
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return [];
      }
      throw err;
    }
  }

  async getQueueStatus(
    companyId?: number,
    companyKey?: string,
    hours = 6,
  ) {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .where('event.timestamp >= :cutoff', { cutoff })
        .orderBy('event.timestamp', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
    const protocols = new Map<string, QueueProtocol & { history: ProtocolEvent[] }>();
    const companyIdsSet = new Set<number>();

    for (const event of events) {
      const key = event.protocol || `${event.participantId}-${event.companyId ?? event.companyKey}`;
      if (!key) {
        continue;
      }

      let current = protocols.get(key);
      if (!current) {
        current = {
          protocol: event.protocol,
          appointmentId: event.appointmentId,
          name: event.name,
          cpf: event.cpf,
          nextGroup: event.nextGroup,
          status: 'waiting',
          lastEvent: event.event ?? '',
          lastUpdate: event.timestamp,
          minutesSinceLastUpdate: 0,
          companyId: event.companyId,
          companyName: event.companyName,
          history: [],
        };
        protocols.set(key, current);
      }

      current.history.push(event);
      current.lastEvent = event.event ?? current.lastEvent;
      current.lastUpdate = event.timestamp;
      current.nextGroup = event.nextGroup ?? current.nextGroup;

      if (event.event === 'PERSON_ENTER_EMERGENCY' || event.event === 'PERSON_PLACE_IN_LINE') {
        current.status = 'waiting';
        current.waitingSince = event.timestamp;
      } else if (event.event === 'PERSON_READY_TO_ATTENDANCE') {
        current.status = 'ready';
        current.waitingSince = current.waitingSince ?? event.timestamp;
      } else if (
        event.event === 'PERSON_START_ATTENDANCE' ||
        event.event === 'PROFESSIONAL_START_ATTENDANCE'
      ) {
        current.status = 'in_attendance';
      } else if (
        event.event === 'PERSON_FINISH_ATTENDANCE' ||
        event.event === 'PERSON_LEAVE_EMERGENCY' ||
        event.event === 'PROFESSIONAL_FINISH_ATTENDANCE'
      ) {
        protocols.delete(key);
      }
    }

    // Preencher nomes de empresa via repositório quando necessário
    let companyNameMap = new Map<number, string>();
    if (companyIdsSet.size > 0) {
      try {
        const companies = await this.companyRepository.find({ where: { id: In(Array.from(companyIdsSet)) } });
        companyNameMap = new Map(companies.map((c) => [c.id, c.name]));
      } catch {}
    }

    const now = Date.now();
    const protocolList: QueueProtocol[] = [];
    let waitingCount = 0;
    let readyCount = 0;
    let inAttendanceCount = 0;

    for (const [, protocol] of protocols) {
      const minutesSinceLastUpdate = Math.round((now - protocol.lastUpdate.getTime()) / 60000);
      protocol.minutesSinceLastUpdate = minutesSinceLastUpdate;
      protocolList.push({
        protocol: protocol.protocol,
        appointmentId: protocol.appointmentId,
        name: protocol.name,
        cpf: protocol.cpf,
        nextGroup: protocol.nextGroup,
        status: protocol.status,
        lastEvent: protocol.lastEvent,
        lastUpdate: protocol.lastUpdate,
        waitingSince: protocol.waitingSince,
        minutesSinceLastUpdate,
        companyId: protocol.companyId,
        companyName: protocol.companyName ?? (protocol.companyId ? companyNameMap.get(protocol.companyId) : undefined),
      });

      if (protocol.status === 'waiting') {
        waitingCount += 1;
      } else if (protocol.status === 'ready') {
        readyCount += 1;
      } else if (protocol.status === 'in_attendance') {
        inAttendanceCount += 1;
      }
    }

    const averageWait = await this.calculateAverageWaitTime(companyId, companyKey, 6);

      return {
        totals: {
          waiting: waitingCount,
          ready: readyCount,
          inAttendance: inAttendanceCount,
        },
        metrics: {
          averageWaitMinutes: averageWait,
        },
        protocols: protocolList.sort(
          (a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime(),
        ),
      };
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return {
          totals: { waiting: 0, ready: 0, inAttendance: 0 },
          metrics: { averageWaitMinutes: 0 },
          protocols: [],
        };
      }
      throw err;
    }
  }

  private async calculateAverageWaitTime(
    companyId?: number,
    companyKey?: string,
    hours = 6,
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .where('event.timestamp >= :cutoff', { cutoff })
        .andWhere(
          `event.event IN ('PERSON_ENTER_EMERGENCY','PERSON_PLACE_IN_LINE','PERSON_START_ATTENDANCE')`,
        )
        .orderBy('event.timestamp', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
    const protocolEnterMap = new Map<string, Date>();
    const durations: number[] = [];

    for (const event of events) {
      const key = event.protocol || `${event.participantId}-${event.companyId ?? event.companyKey}`;
      if (!key) {
        continue;
      }

      if (
        event.event === 'PERSON_ENTER_EMERGENCY' ||
        event.event === 'PERSON_PLACE_IN_LINE'
      ) {
        protocolEnterMap.set(key, event.timestamp);
      } else if (event.event === 'PERSON_START_ATTENDANCE') {
        const start = protocolEnterMap.get(key);
        if (start) {
          const diff = (event.timestamp.getTime() - start.getTime()) / 60000;
          if (diff >= 0) {
            durations.push(diff);
          }
          protocolEnterMap.delete(key);
        }
      }
    }

    if (!durations.length) {
      return 0;
    }

      const sum = durations.reduce((acc, cur) => acc + cur, 0);
      return Math.round((sum / durations.length) * 10) / 10;
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return 0;
      }
      throw err;
    }
  }

  private calculatePercentiles(values: number[]) {
    if (!values || values.length === 0) {
      return { count: 0, avg: 0, median: 0, p90: 0, p95: 0, max: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const avg = Number((sorted.reduce((a, b) => a + b, 0) / count).toFixed(2));
    const median = count % 2 === 1
      ? sorted[(count - 1) / 2]
      : Number(((sorted[count / 2 - 1] + sorted[count / 2]) / 2).toFixed(2));
    const idx = (p: number) => Math.max(0, Math.min(Math.ceil(p * count) - 1, count - 1));
    const p90 = sorted[idx(0.9)];
    const p95 = sorted[idx(0.95)];
    const max = sorted[count - 1];
    return { count, avg, median, p90, p95, max };
  }

  async getWaitTimeStats(
    companyId?: number,
    companyKey?: string,
    hours = 6,
  ) {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .where('event.timestamp >= :cutoff', { cutoff })
        .orderBy('event.timestamp', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
    const byProtocol = new Map<string, ProtocolEvent[]>();

    for (const ev of events) {
      const key = ev.protocol || `${ev.participantId}-${ev.companyId ?? ev.companyKey}`;
      if (!key) continue;
      const arr = byProtocol.get(key) || [];
      arr.push(ev);
      byProtocol.set(key, arr);
    }

    const confirmationDurations: number[] = [];
    const consultationDurations: number[] = [];
    const serviceDurations: number[] = [];

    for (const [, history] of byProtocol) {
      // Ordenar por timestamp
      history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      let enterOrLine: Date | undefined;
      let ready: Date | undefined;
      let start: Date | undefined;
      let finish: Date | undefined;

      for (const e of history) {
        if (e.event === 'PERSON_ENTER_EMERGENCY' || e.event === 'PERSON_PLACE_IN_LINE') {
          enterOrLine = e.timestamp;
        } else if (e.event === 'PERSON_READY_TO_ATTENDANCE') {
          ready = e.timestamp;
        } else if (e.event === 'PERSON_START_ATTENDANCE' || e.event === 'PROFESSIONAL_START_ATTENDANCE') {
          start = e.timestamp;
        } else if (e.event === 'PERSON_FINISH_ATTENDANCE' || e.event === 'PROFESSIONAL_FINISH_ATTENDANCE') {
          finish = e.timestamp;
        }
      }

      if (enterOrLine && ready) {
        const diff = (ready.getTime() - enterOrLine.getTime()) / 60000;
        if (diff >= 0) confirmationDurations.push(Number(diff.toFixed(2)));
      }
      if (ready && start) {
        const diff = (start.getTime() - ready.getTime()) / 60000;
        if (diff >= 0) consultationDurations.push(Number(diff.toFixed(2)));
      }
      if (start && finish) {
        const diff = (finish.getTime() - start.getTime()) / 60000;
        if (diff >= 0) serviceDurations.push(Number(diff.toFixed(2)));
      }
    }

      return {
        confirmation: this.calculatePercentiles(confirmationDurations),
        consultation: this.calculatePercentiles(consultationDurations),
        service: this.calculatePercentiles(serviceDurations),
      };
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        const zero = { count: 0, avg: 0, median: 0, p90: 0, p95: 0, max: 0 };
        return { confirmation: zero, consultation: zero, service: zero };
      }
      throw err;
    }
  }

  private async computeWaitSlaPercent(
    companyId?: number,
    companyKey?: string,
    hours = 6,
    thresholdMinutes = 30,
  ): Promise<{ percent: number; samples: number }> {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .where('event.timestamp >= :cutoff', { cutoff })
        .orderBy('event.timestamp', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
      const byProtocol = new Map<string, ProtocolEvent[]>();

      for (const ev of events) {
        const key = ev.protocol || `${ev.participantId}-${ev.companyId ?? ev.companyKey}`;
        if (!key) continue;
        const arr = byProtocol.get(key) || [];
        arr.push(ev);
        byProtocol.set(key, arr);
      }

      const confirmationDurations: number[] = [];

      for (const [, history] of byProtocol) {
        history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        let enterOrLine: Date | undefined;
        let ready: Date | undefined;

        for (const e of history) {
          if (e.event === 'PERSON_ENTER_EMERGENCY' || e.event === 'PERSON_PLACE_IN_LINE') {
            enterOrLine = e.timestamp;
          } else if (e.event === 'PERSON_READY_TO_ATTENDANCE') {
            ready = e.timestamp;
          }
        }

        if (enterOrLine && ready) {
          const diff = (ready.getTime() - enterOrLine.getTime()) / 60000;
          if (diff >= 0) confirmationDurations.push(Number(diff.toFixed(2)));
        }
      }

      const samples = confirmationDurations.length;
      if (!samples) {
        return { percent: 0, samples: 0 };
      }
      const under = confirmationDurations.filter((d) => d <= thresholdMinutes).length;
      const percent = Math.round((under / samples) * 100);
      return { percent, samples };
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return { percent: 0, samples: 0 };
      }
      throw err;
    }
  }

  private async computeTotalAvgDuration(
    companyId?: number,
    companyKey?: string,
    hours = 6,
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const qb = this.protocolEventRepository
        .createQueryBuilder('event')
        .where('event.timestamp >= :cutoff', { cutoff })
        .orderBy('event.timestamp', 'ASC');

      this.applyCompanyFilter(qb, companyId, companyKey);

      const events = await qb.getMany();
      const byProtocol = new Map<string, ProtocolEvent[]>();

      for (const ev of events) {
        const key = ev.protocol || `${ev.participantId}-${ev.companyId ?? ev.companyKey}`;
        if (!key) continue;
        const arr = byProtocol.get(key) || [];
        arr.push(ev);
        byProtocol.set(key, arr);
      }

      const totalDurations: number[] = [];

      for (const [, history] of byProtocol) {
        history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        let enterOrLine: Date | undefined;
        let finish: Date | undefined;

        for (const e of history) {
          if (e.event === 'PERSON_ENTER_EMERGENCY' || e.event === 'PERSON_PLACE_IN_LINE') {
            enterOrLine = e.timestamp;
          } else if (e.event === 'PERSON_FINISH_ATTENDANCE' || e.event === 'PROFESSIONAL_FINISH_ATTENDANCE') {
            finish = e.timestamp;
          }
        }

        if (enterOrLine && finish) {
          const diff = (finish.getTime() - enterOrLine.getTime()) / 60000;
          if (diff >= 0) totalDurations.push(Number(diff.toFixed(2)));
        }
      }

      if (!totalDurations.length) return 0;
      const sum = totalDurations.reduce((a, b) => a + b, 0);
      return Math.round((sum / totalDurations.length) * 10) / 10;
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        return 0;
      }
      throw err;
    }
  }

  async getConsolidatedStats(
    companyId?: number,
    companyKey?: string,
    hours = 6,
  ) {
    const queue = await this.getQueueStatus(companyId, companyKey, hours);
    const wait = await this.getWaitTimeStats(companyId, companyKey, hours);
    const sla30 = await this.computeWaitSlaPercent(companyId, companyKey, hours, 30);
    const perHour = await this.getHourlyAttendance(companyId, companyKey, hours);
    const totalAvg = await this.computeTotalAvgDuration(companyId, companyKey, hours);

    const active = {
      waiting: queue.totals.waiting,
      pre: queue.totals.ready,
      inAttendance: queue.totals.inAttendance,
      total: queue.totals.waiting + queue.totals.ready + queue.totals.inAttendance,
    };

    const waitTimes = {
      median: wait.confirmation.median,
      mean: wait.confirmation.avg,
      sla30: sla30.percent,
      samples: wait.confirmation.count,
    };

    const consultation = {
      meanDuration: wait.consultation.avg,
      totalDuration: totalAvg,
    };

    return {
      active,
      wait: waitTimes,
      consultation,
      trends: {
        perHour,
      },
    };
  }

  async getTopDoctorsRealtime(companyId?: number, hours = 12) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const query = `
      SELECT ap.name as doctor_name, COUNT(DISTINCT a.id) AS appointments
      FROM appointments a
      JOIN appointment_participants ap ON a.id = ap.appointment_id AND a.company_id = ap.company_id
      WHERE a.executed_date_time IS NOT NULL
        AND a.executed_date_time >= ?
        AND (ap.role = 'mmd' OR ap.role = 'doctor')
        AND a.appointment_specialty NOT LIKE '%dados%'
        ${companyId ? 'AND a.company_id = ?' : ''}
      GROUP BY ap.name
      ORDER BY appointments DESC
      LIMIT 10
    `;
    const params = companyId ? [cutoff, companyId] : [cutoff];
    const rows = await this.appointmentRepository.query(query, params);
    return rows.map((row: any) => ({ doctor_name: row.doctor_name?.trim() || 'N/A', appointments: Number(row.appointments) || 0 }));
  }

  async getTopSpecialtiesRealtime(companyId?: number, hours = 12) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const query = `
      SELECT a.appointment_specialty as name, COUNT(*) as count
      FROM appointments a
      WHERE a.executed_date_time IS NOT NULL
        AND a.executed_date_time >= ?
        AND a.appointment_specialty IS NOT NULL AND a.appointment_specialty != ''
        AND a.appointment_specialty != 'Confirmação de Dados'
        ${companyId ? 'AND a.company_id = ?' : ''}
      GROUP BY a.appointment_specialty
      ORDER BY count DESC
      LIMIT 10
    `;
    const params = companyId ? [cutoff, companyId] : [cutoff];
    const rows = await this.appointmentRepository.query(query, params);
    return rows.map((row: any) => ({ name: row.name, count: Number(row.count) || 0 }));
  }

  async getTopCID10Realtime(companyId?: number, hours = 12) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const query = `
      SELECT a.cid10_value as cid10, COUNT(*) as count
      FROM appointments a
      WHERE a.executed_date_time IS NOT NULL
        AND a.executed_date_time >= ?
        AND a.cid10_value IS NOT NULL AND a.cid10_value != ''
        ${companyId ? 'AND a.company_id = ?' : ''}
      GROUP BY a.cid10_value
      ORDER BY count DESC
      LIMIT 5
    `;
    const params = companyId ? [cutoff, companyId] : [cutoff];
    const rows = await this.appointmentRepository.query(query, params);
    return rows.map((row: any) => ({ cid10: row.cid10, count: Number(row.count) || 0 }));
  }

  async getCompaniesLeaderboardRealtime(hours = 12) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const volumeQuery = `
      SELECT c.id as company_id, c.name as company_name, COUNT(*) AS total_appointments
      FROM appointments a
      JOIN companies c ON c.id = a.company_id
      WHERE a.executed_date_time IS NOT NULL
        AND a.executed_date_time >= ?
      GROUP BY c.id, c.name
      ORDER BY total_appointments DESC
      LIMIT 10
    `;
    const topByVolume = await this.appointmentRepository.query(volumeQuery, [cutoff]);

    let topByWait: any[] = [];
    try {
      // Média de espera (ENTER/LINE -> START) por empresa nas últimas horas
      const waitQuery = `
        SELECT COALESCE(event.company_id, 0) AS company_id, COALESCE(event.company_name, 'N/A') AS company_name,
               AVG(TIMESTAMPDIFF(MINUTE, enter_ts, start_ts)) AS avg_wait_minutes,
               COUNT(*) AS total_protocols
        FROM (
          SELECT e.company_id, e.company_name,
                 MIN(CASE WHEN e.event IN ('PERSON_ENTER_EMERGENCY','PERSON_PLACE_IN_LINE') THEN e.timestamp END) AS enter_ts,
                 MIN(CASE WHEN e.event IN ('PERSON_START_ATTENDANCE','PROFESSIONAL_START_ATTENDANCE') THEN e.timestamp END) AS start_ts
          FROM protocol_events e
          WHERE e.timestamp >= ?
          GROUP BY e.company_id, e.company_name, e.protocol
        ) t
        JOIN protocol_events event ON event.company_id = t.company_id
        WHERE t.enter_ts IS NOT NULL AND t.start_ts IS NOT NULL
        GROUP BY event.company_id, event.company_name
        HAVING total_protocols > 0
        ORDER BY avg_wait_minutes DESC
        LIMIT 10
      `;
      topByWait = await this.protocolEventRepository.query(waitQuery, [cutoff]);
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') {
        throw err;
      }
    }

    return {
      topByVolume: topByVolume.map((row: any) => ({
        company_id: Number(row.company_id),
        company_name: row.company_name,
        total_appointments: Number(row.total_appointments) || 0,
      })),
      topByWait: topByWait.map((row: any) => ({
        company_id: Number(row.company_id),
        company_name: row.company_name,
        avg_wait_minutes: Number(row.avg_wait_minutes) || 0,
        total_protocols: Number(row.total_protocols) || 0,
      })),
    };
  }

  private async runRepoQueryWithRetry<T = any>(repo: Repository<any>, query: string, params: any[], attempts = 2): Promise<T> {
    let lastError: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await repo.query(query, params);
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'PROTOCOL_CONNECTION_LOST' && i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}
      if (event.companyId) {
        current.companyId = event.companyId;
        companyIdsSet.add(event.companyId);
      }
      if (event.companyName) {
        current.companyName = event.companyName;
      }
