import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentParticipant, AppointmentDetail } from '../entities';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(AppointmentParticipant)
    private participantRepository: Repository<AppointmentParticipant>,
    @InjectRepository(AppointmentDetail)
    private detailRepository: Repository<AppointmentDetail>,
  ) {}

  async getDoctorReport(companyId: number, doctorName: string, startDate: string, endDate: string) {
    const query = `
      SELECT 
        a.id,
        a.executed_date_time,
        a.appointment_specialty,
        a.cid10_value,
        a.total_appointment_time,
        ap.name as doctor_name
      FROM appointments a
      INNER JOIN appointment_participants ap ON a.id = ap.appointment_id
      WHERE a.company_id = ? 
        AND ap.role = 'doctor'
        AND ap.name = ?
        AND DATE(a.executed_date_time) BETWEEN ? AND ?
        AND a.executed_date_time IS NOT NULL
      ORDER BY a.executed_date_time DESC
    `;

    return await this.appointmentRepository.query(query, [companyId, doctorName, startDate, endDate]);
  }

  async getDetailedAppointments(companyId: number, startDate: string, endDate: string, limit: number = 50) {
    const query = `
      SELECT 
        a.id,
        a.executed_date_time,
        a.appointment_specialty,
        a.cid10_value,
        a.total_appointment_time,
        ap.name as doctor_name,
        ad.description,
        ad.reason,
        ad.orientation
      FROM appointments a
      LEFT JOIN appointment_participants ap ON a.id = ap.appointment_id AND ap.role = 'doctor'
      LEFT JOIN appointment_details ad ON a.id = ad.appointment_id
      WHERE a.company_id = ? 
        AND DATE(a.executed_date_time) BETWEEN ? AND ?
        AND a.executed_date_time IS NOT NULL
      ORDER BY a.executed_date_time DESC
      LIMIT ?
    `;

    return await this.appointmentRepository.query(query, [companyId, startDate, endDate, limit]);
  }

  async getSpecialtyReport(companyId: number, specialty: string, startDate: string, endDate: string) {
    const query = `
      SELECT 
        a.id,
        a.executed_date_time,
        a.cid10_value,
        a.total_appointment_time,
        ap.name as doctor_name
      FROM appointments a
      LEFT JOIN appointment_participants ap ON a.id = ap.appointment_id AND ap.role = 'doctor'
      WHERE a.company_id = ? 
        AND a.appointment_specialty = ?
        AND DATE(a.executed_date_time) BETWEEN ? AND ?
        AND a.executed_date_time IS NOT NULL
      ORDER BY a.executed_date_time DESC
    `;

    return await this.appointmentRepository.query(query, [companyId, specialty, startDate, endDate]);
  }

  async getCID10Report(companyId: number, cid10Value: string, startDate: string, endDate: string) {
    const query = `
      SELECT 
        a.id,
        a.executed_date_time,
        a.appointment_specialty,
        a.total_appointment_time,
        ap.name as doctor_name
      FROM appointments a
      LEFT JOIN appointment_participants ap ON a.id = ap.appointment_id AND ap.role = 'doctor'
      WHERE a.company_id = ? 
        AND a.cid10_value = ?
        AND DATE(a.executed_date_time) BETWEEN ? AND ?
        AND a.executed_date_time IS NOT NULL
      ORDER BY a.executed_date_time DESC
    `;

    return await this.appointmentRepository.query(query, [companyId, cid10Value, startDate, endDate]);
  }

  async getMonthlyComparison(companyId: number, currentMonth: string, previousMonth: string) {
    const currentQuery = `
      SELECT COUNT(*) as current_count
      FROM appointments
      WHERE company_id = ? 
        AND DATE_FORMAT(executed_date_time, '%Y-%m') = ?
        AND executed_date_time IS NOT NULL
    `;

    const previousQuery = `
      SELECT COUNT(*) as previous_count
      FROM appointments
      WHERE company_id = ? 
        AND DATE_FORMAT(executed_date_time, '%Y-%m') = ?
        AND executed_date_time IS NOT NULL
    `;

    const [currentResult, previousResult] = await Promise.all([
      this.appointmentRepository.query(currentQuery, [companyId, currentMonth]),
      this.appointmentRepository.query(previousQuery, [companyId, previousMonth])
    ]);

    const current = currentResult[0]?.current_count || 0;
    const previous = previousResult[0]?.previous_count || 0;
    const percentageChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    return {
      current,
      previous,
      percentageChange: Math.round(percentageChange * 100) / 100
    };
  }
}