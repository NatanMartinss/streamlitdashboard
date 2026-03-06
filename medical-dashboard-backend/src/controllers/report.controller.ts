import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ReportService } from '../services/report.service';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('doctor')
  async getDoctorReport(
    @Query('company_id') companyId: string,
    @Query('doctor_name') doctorName: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !doctorName || !startDate || !endDate) {
        throw new HttpException(
          'company_id, doctor_name, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.reportService.getDoctorReport(
        parseInt(companyId),
        doctorName,
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar relatório do médico',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('detailed-appointments')
  async getDetailedAppointments(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.reportService.getDetailedAppointments(
        parseInt(companyId),
        startDate,
        endDate,
        limit ? parseInt(limit) : 50,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar consultas detalhadas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('specialty')
  async getSpecialtyReport(
    @Query('company_id') companyId: string,
    @Query('specialty') specialty: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !specialty || !startDate || !endDate) {
        throw new HttpException(
          'company_id, specialty, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.reportService.getSpecialtyReport(
        parseInt(companyId),
        specialty,
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar relatório da especialidade',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('cid10')
  async getCID10Report(
    @Query('company_id') companyId: string,
    @Query('cid10_value') cid10Value: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !cid10Value || !startDate || !endDate) {
        throw new HttpException(
          'company_id, cid10_value, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.reportService.getCID10Report(
        parseInt(companyId),
        cid10Value,
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar relatório do CID10',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('monthly-comparison')
  async getMonthlyComparison(
    @Query('company_id') companyId: string,
    @Query('current_month') currentMonth: string,
    @Query('previous_month') previousMonth: string,
  ) {
    try {
      if (!companyId || !currentMonth || !previousMonth) {
        throw new HttpException(
          'company_id, current_month e previous_month são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.reportService.getMonthlyComparison(
        parseInt(companyId),
        currentMonth,
        previousMonth,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar comparação mensal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}