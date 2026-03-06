import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { MetricsService } from './metrics.service';
import {
  CompanyPeriodDto,
  MetricResponse,
  MetricItemsResponse,
} from './dto/metrics.dto';

@Controller('dashboard/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  // Operacional
  @Get('attendance-show-rate')
  async getShowRate(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricResponse<number>> {
    return this.metricsService.getShowRate({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    });
  }

  @Get('rework-rate')
  async getReworkRate(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricResponse<number>> {
    return this.metricsService.getReworkRate({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    });
  }

  @Get('doctor-avg-times')
  async getDoctorAvgTimes(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
    @Query('limit') limit?: string,
  ): Promise<MetricItemsResponse<number>> {
    return this.metricsService.getDoctorAvgTimes({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    }, limit ? Number(limit) : 10);
  }

  @Get('specialty-hour-distribution')
  async getSpecialtyHourDistribution(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricItemsResponse<number>> {
    return this.metricsService.getSpecialtyHourDistribution({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    });
  }

  // Clínico / Estatístico
  @Get('service-time-percentiles')
  async getServiceTimePercentiles(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricResponse<Record<string, number>>> {
    return this.metricsService.getServiceTimePercentiles({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    });
  }

  @Get('daily-volume-stats')
  async getDailyVolumeStats(
    @Query('company_id') company_id: string,
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricResponse<Record<string, number>>> {
    return this.metricsService.getDailyVolumeStats({
      company_id: company_id ? Number(company_id) : undefined,
      start_date,
      end_date,
    });
  }

  // Multiempresa
  @Get('company-share')
  async getCompanyShare(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricItemsResponse<number>> {
    return this.metricsService.getCompanyShare({ start_date, end_date });
  }

  @Get('company-weekly-trend')
  async getCompanyWeeklyTrend(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ): Promise<MetricItemsResponse<number>> {
    return this.metricsService.getCompanyWeeklyTrend({ start_date, end_date });
  }
}