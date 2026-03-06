import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('top-doctors')
  async getTopDoctors(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getTopDoctors(
        parseInt(companyId),
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar top médicos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('wait-times')
  async getWaitTimes(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
    @Query('refresh') refresh: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getWaitTimesFromAppointments(
        parseInt(companyId, 10),
        startDate,
        endDate,
        refresh === 'true' || refresh === '1',
      );
      return result;
    } catch (error) {
      console.error('Erro ao buscar wait-times:', error);
      throw new HttpException(
        'Erro ao buscar tempos de espera',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('protocol-wait-times')
  async getProtocolWaitTimes(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getProtocolWaitTimes(
        parseInt(companyId),
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      console.log(error)
      throw new HttpException(
        'Erro ao buscar tempos de espera de protocolos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('monthly-comparison')
  async getMonthlyComparison(@Query('companyId') companyId: number) {
    return this.dashboardService.getMonthlyComparison(companyId);
  }

  @Get('top-cid10')
  async getTopCID10(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getTopCID10(
        parseInt(companyId),
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar top CID10',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('weekly-data')
  async getWeeklyData(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getWeeklyData(
        parseInt(companyId),
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar dados semanais',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('hourly-data')
  async getHourlyData(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.dashboardService.getHourlyData(
        parseInt(companyId),
        startDate,
        endDate,
      );

      return result;
    } catch (error) {
      throw new HttpException(
        'Erro ao buscar dados por hora',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('indicators')
  async getIndicators(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date sǜo obrigat��rios',
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.dashboardService.getComprehensiveIndicators(
        parseInt(companyId, 10),
        startDate,
        endDate,
      );
    } catch (error) {
      console.error('Erro ao buscar indicadores completos:', error);
      throw new HttpException(
        'Erro ao buscar indicadores completos',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('stats')
  async getStats(
    @Query('company_id') companyId: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    try {
      if (!companyId || !startDate || !endDate) {
        throw new HttpException(
          'company_id, start_date e end_date são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Primeiro, vamos testar apenas os métodos que sabemos que funcionam
      const [
        totalAppointments, 
        averageTime, 
        topSpecialties,
        topDoctors,
        topCid10,
        hourlyData,
        weeklyData
      ] = await Promise.all([
        this.dashboardService.getTotalAppointments(parseInt(companyId), startDate, endDate),
        this.dashboardService.getAverageAppointmentTime(parseInt(companyId), startDate, endDate),
        this.dashboardService.getTopSpecialties(parseInt(companyId), startDate, endDate),
        this.dashboardService.getTopDoctors(parseInt(companyId), startDate, endDate),
        this.dashboardService.getTopCID10(parseInt(companyId), startDate, endDate),
        this.dashboardService.getHourlyData(parseInt(companyId), startDate, endDate),
        this.dashboardService.getWeeklyData(parseInt(companyId), startDate, endDate),
      ]);

      // Agora vamos testar os novos métodos individualmente
      let totalDoctors = 0;
      let totalPrescriptions = 0;
      let totalCertificates = 0;
      let growthPercentage = 0;

      try {
        totalDoctors = await this.dashboardService.getTotalDoctors(parseInt(companyId), startDate, endDate);
      } catch (error) {
        console.error('Erro ao buscar total de médicos:', error);
      }

      try {
        totalPrescriptions = await this.dashboardService.getTotalPrescriptions(parseInt(companyId), startDate, endDate);
      } catch (error) {
        console.error('Erro ao buscar total de prescrições:', error);
      }

      try {
        totalCertificates = await this.dashboardService.getTotalCertificates(parseInt(companyId), startDate, endDate);
      } catch (error) {
        console.error('Erro ao buscar total de certificados:', error);
      }

      try {
        growthPercentage = await this.dashboardService.getGrowthPercentage(parseInt(companyId), startDate, endDate);
      } catch (error) {
        console.error('Erro ao buscar percentual de crescimento:', error);
      }

      let totalDataConfirmations = 0;
      try {
        totalDataConfirmations = await this.dashboardService.getTotalDataConfirmations(parseInt(companyId), startDate, endDate);
      } catch (error) {
        console.error('Erro ao buscar total de confirmações de dados:', error);
      }

      return {
        kpis: {
          total_doctors: totalDoctors,
          total_appointments: totalAppointments,
          total_prescriptions: totalPrescriptions,
          total_certificates: totalCertificates,
          total_data_confirmations: totalDataConfirmations,
          avg_service_time: averageTime,
          growth_percentage: growthPercentage,
        },
        top_doctors: topDoctors,
        top_cid10: topCid10,
        top_specialties: topSpecialties,
        hourly_data: hourlyData,
        weekly_data: weeklyData,
      };
    } catch (error) {
      console.error('Erro no endpoint stats:', error);
      throw new HttpException(
        'Erro ao buscar estatísticas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
