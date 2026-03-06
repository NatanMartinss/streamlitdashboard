import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentParticipant } from '../../entities/appointment-participant.entity';
import { Company } from '../../entities/company.entity';
import { Protocol } from '../../entities/protocol.entity';
import { ProtocolHistory } from '../../entities/protocol-history.entity';
import {
  CompanyPeriodDto,
  MetricResponse,
  MetricItemsResponse,
} from './dto/metrics.dto';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(AppointmentParticipant)
    private readonly participantRepo: Repository<AppointmentParticipant>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Protocol)
    private readonly protocolRepo: Repository<Protocol>,
    @InjectRepository(ProtocolHistory)
    private readonly protocolHistoryRepo: Repository<ProtocolHistory>,
  ) {}

  // Simple in-memory cache with TTL
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private getCache<T>(key: string): T | undefined {
    // Cache desativado: sempre retorna undefined para forçar recomputação
    return undefined;
  }
  private setCache(key: string, value: any, ttlSeconds = 90) {
    // Cache desativado: no-op
  }

  private makeKey(metric: string, params: Record<string, any>) {
    return `${metric}:${Object.entries(params)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')}`;
  }

  // Operacional
  async getShowRate(dto: CompanyPeriodDto): Promise<MetricResponse<number>> {
    const key = this.makeKey('show_rate', dto);
    const cached = this.getCache<MetricResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const scheduled = await this.appointmentRepo.query(
      `SELECT COUNT(*) AS total
       FROM appointment a
       WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
       ${companyFilter}`,
      params,
    );

    const executed = await this.appointmentRepo.query(
      `SELECT COUNT(*) AS total
       FROM appointment a
       WHERE a.executed_date_time IS NOT NULL
         AND a.schedule_date_time >= ? AND a.schedule_date_time <= ?
       ${companyFilter}`,
      params,
    );

    const totalScheduled = Number(scheduled?.[0]?.total || 0);
    const totalExecuted = Number(executed?.[0]?.total || 0);
    const value = totalScheduled > 0 ? (totalExecuted / totalScheduled) * 100 : 0;

    const result: MetricResponse<number> = {
      metric: 'show_rate',
      value: Number(value.toFixed(2)),
      unit: '%',
      details: { total_scheduled: totalScheduled, total_executed: totalExecuted },
    };
    this.setCache(key, result);
    return result;
  }

  async getReworkRate(dto: CompanyPeriodDto): Promise<MetricResponse<number>> {
    const key = this.makeKey('rework_rate', dto);
    const cached = this.getCache<MetricResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const totalAppointmentsRow = await this.appointmentRepo.query(
      `SELECT COUNT(*) AS total
       FROM appointment a
       WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
       ${companyFilter}`,
      params,
    );
    const totalAppointments = Number(totalAppointmentsRow?.[0]?.total || 0);

    // Rework heuristic: cancelled or rescheduled statuses
    const reworkRow = await this.appointmentRepo.query(
      `SELECT COUNT(*) AS total
       FROM appointment a
       WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
         AND (a.status_appointment IN ('cancelled','canceled','rescheduled','reagendado','reagendada'))
       ${companyFilter}`,
      params,
    );
    const totalRework = Number(reworkRow?.[0]?.total || 0);
    const value = totalAppointments > 0 ? (totalRework / totalAppointments) * 100 : 0;

    const result: MetricResponse<number> = {
      metric: 'rework_rate',
      value: Number(value.toFixed(2)),
      unit: '%',
      details: { total_appointments: totalAppointments, total_rework: totalRework },
    };
    this.setCache(key, result);
    return result;
  }

  async getDoctorAvgTimes(
    dto: CompanyPeriodDto,
    limit = 10,
  ): Promise<MetricItemsResponse<number>> {
    const key = this.makeKey('doctor_avg_times', { ...dto, limit });
    const cached = this.getCache<MetricItemsResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const rows = await this.appointmentRepo.query(
      `SELECT ap.name_original AS doctor_name,
              COUNT(*) AS total,
              AVG(a.total_appointment_time) AS avg_seconds
       FROM appointment a
       JOIN appointment_participant ap ON ap.appointment_id = a.id AND ap.role = 'doctor'
       WHERE a.executed_date_time IS NOT NULL
         AND a.schedule_date_time >= ? AND a.schedule_date_time <= ?
         ${companyFilter}
       GROUP BY ap.name_original
       ORDER BY avg_seconds DESC
       LIMIT ${limit}`,
      params,
    );

    const items = (rows || []).map((r: any) => ({
      label: r.doctor_name || 'N/A',
      value: Number((Number(r.avg_seconds || 0) / 60).toFixed(2)), // minutes
      details: { count: Number(r.total || 0) },
    }));

    const result: MetricItemsResponse<number> = {
      metric: 'doctor_avg_times',
      items,
      unit: 'minutes',
    };
    this.setCache(key, result);
    return result;
  }

  async getSpecialtyHourDistribution(
    dto: CompanyPeriodDto,
  ): Promise<MetricItemsResponse<number>> {
    const key = this.makeKey('specialty_hour_distribution', dto);
    const cached = this.getCache<MetricItemsResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const rows = await this.appointmentRepo.query(
      `SELECT DATE_FORMAT(a.executed_date_time, '%H') AS hour,
              a.appointment_specialty AS specialty,
              COUNT(*) AS total
       FROM appointment a
       WHERE a.executed_date_time IS NOT NULL
         AND a.schedule_date_time >= ? AND a.schedule_date_time <= ?
         ${companyFilter}
       GROUP BY hour, specialty
       ORDER BY hour ASC, total DESC`,
      params,
    );

    const items = (rows || []).map((r: any) => ({
      label: `${r.hour}:00 - ${r.specialty || 'N/A'}`,
      value: Number(r.total || 0),
    }));

    const result: MetricItemsResponse<number> = {
      metric: 'specialty_hour_distribution',
      items,
    };
    this.setCache(key, result);
    return result;
  }

  // Clínico / Estatístico
  async getServiceTimePercentiles(
    dto: CompanyPeriodDto,
  ): Promise<MetricResponse<Record<string, number>>> {
    const key = this.makeKey('service_time_percentiles', dto);
    const cached = this.getCache<MetricResponse<Record<string, number>>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const times = await this.appointmentRepo.query(
      `SELECT a.total_appointment_time AS sec
       FROM appointment a
       WHERE a.executed_date_time IS NOT NULL
         AND a.total_appointment_time IS NOT NULL
         AND a.schedule_date_time >= ? AND a.schedule_date_time <= ?
         ${companyFilter}`,
      params,
    );

    const arr = (times || [])
      .map((t: any) => Number(t.sec))
      .filter((x: number) => Number.isFinite(x) && x >= 0)
      .sort((a, b) => a - b);

    const n = arr.length;
    const percentile = (p: number) => {
      if (n === 0) return 0;
      const idx = Math.ceil((p / 100) * n) - 1;
      return arr[Math.max(0, Math.min(idx, n - 1))];
    };
    const avg = n ? arr.reduce((s, v) => s + v, 0) / n : 0;

    const value = {
      median: Number((percentile(50) / 60).toFixed(2)),
      p90: Number((percentile(90) / 60).toFixed(2)),
      p95: Number((percentile(95) / 60).toFixed(2)),
      avg: Number((avg / 60).toFixed(2)),
    };

    const result: MetricResponse<Record<string, number>> = {
      metric: 'service_time_percentiles',
      value,
      unit: 'minutes',
      details: { count: n },
    };
    this.setCache(key, result);
    return result;
  }

  async getDailyVolumeStats(
    dto: CompanyPeriodDto,
  ): Promise<MetricResponse<Record<string, number>>> {
    const key = this.makeKey('daily_volume_stats', dto);
    const cached = this.getCache<MetricResponse<Record<string, number>>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    let companyFilter = '';
    if (dto.company_id) {
      companyFilter = 'AND a.company_id = ?';
      params.push(dto.company_id);
    }

    const rows = await this.appointmentRepo.query(
      `WITH daily AS (
         SELECT DATE(a.schedule_date_time) AS d, COUNT(*) AS c
         FROM appointment a
         WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
           ${companyFilter}
         GROUP BY DATE(a.schedule_date_time)
       )
       SELECT AVG(c) AS avg_c,
              COALESCE(STDDEV_SAMP(c), 0) AS stddev_c
       FROM daily`,
      params,
    );

    const avg = Number(rows?.[0]?.avg_c || 0);
    const stddev = Number(rows?.[0]?.stddev_c || 0);
    const result: MetricResponse<Record<string, number>> = {
      metric: 'daily_volume_stats',
      value: { average: Number(avg.toFixed(2)), stddev: Number(stddev.toFixed(2)) },
      unit: 'appointments/day',
    };
    this.setCache(key, result);
    return result;
  }

  // Multiempresa
  async getCompanyShare(
    dto: CompanyPeriodDto,
  ): Promise<MetricItemsResponse<number>> {
    const key = this.makeKey('company_share', dto);
    const cached = this.getCache<MetricItemsResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    const rows = await this.appointmentRepo.query(
      `SELECT a.company_id, c.name AS company_name, COUNT(*) AS total
       FROM appointment a
       JOIN company c ON c.id = a.company_id
       WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
       GROUP BY a.company_id, c.name
       ORDER BY total DESC`,
      params,
    );

    const totalAll = (rows || []).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const items = (rows || []).map((r: any) => ({
      label: r.company_name || `Company ${r.company_id}`,
      value: totalAll > 0 ? Number(((Number(r.total || 0) / totalAll) * 100).toFixed(2)) : 0,
      details: { count: Number(r.total || 0), company_id: Number(r.company_id) },
    }));

    const result: MetricItemsResponse<number> = {
      metric: 'company_share',
      items,
      unit: '%',
    };
    this.setCache(key, result, 120);
    return result;
  }

  async getCompanyWeeklyTrend(
    dto: CompanyPeriodDto,
  ): Promise<MetricItemsResponse<number>> {
    const key = this.makeKey('company_weekly_trend', dto);
    const cached = this.getCache<MetricItemsResponse<number>>(key);
    if (cached) return cached;

    const params: any[] = [dto.start_date, dto.end_date];
    const rows = await this.appointmentRepo.query(
      `SELECT a.company_id, c.name AS company_name,
              DATE_FORMAT(a.schedule_date_time, '%Y-%u') AS year_week,
              COUNT(*) AS total
       FROM appointment a
       JOIN company c ON c.id = a.company_id
       WHERE a.schedule_date_time >= ? AND a.schedule_date_time <= ?
       GROUP BY a.company_id, c.name, DATE_FORMAT(a.schedule_date_time, '%Y-%u')
       ORDER BY year_week ASC, total DESC`,
      params,
    );

    const items = (rows || []).map((r: any) => ({
      label: `${r.year_week} - ${r.company_name}`,
      value: Number(r.total || 0),
      details: { company_id: Number(r.company_id), year_week: r.year_week },
    }));

    const result: MetricItemsResponse<number> = {
      metric: 'company_weekly_trend',
      items,
      unit: 'appointments/week',
    };
    this.setCache(key, result, 120);
    return result;
  }
}