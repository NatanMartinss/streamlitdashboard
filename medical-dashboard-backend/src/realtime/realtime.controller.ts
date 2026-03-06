import { Body, Controller, Get, Post, Query, ValidationPipe } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { CreateProtocolEventDto } from './dto/create-protocol-event.dto';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Post('events')
  async ingestEvent(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
    dto: CreateProtocolEventDto,
  ) {
    return this.realtimeService.recordEvent(dto);
  }

  @Get('hourly-attendance')
  async getHourlyAttendance(
    @Query('company_id') companyId?: string,
    @Query('company_key') companyKey?: string,
    @Query('hours') hoursParam?: string,
  ): Promise<Array<{ hour: string; total: number }>> {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 12;
    if (!Number.isFinite(hours) || hours <= 0) {
      hours = 12;
    }
    return this.realtimeService.getHourlyAttendance(id, companyKey, hours);
  }

  @Get('queue-status')
  async getQueueStatus(
    @Query('company_id') companyId?: string,
    @Query('company_key') companyKey?: string,
    @Query('hours') hoursParam?: string,
  ): Promise<any> {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 6;
    if (!Number.isFinite(hours) || hours <= 0) {
      hours = 6;
    }
    return this.realtimeService.getQueueStatus(id, companyKey, hours);
  }

  @Get('recent-events')
  async getRecentEvents(
    @Query('company_id') companyId?: string,
    @Query('company_key') companyKey?: string,
    @Query('limit') limitParam?: string,
  ): Promise<any> {
    const id = companyId ? Number(companyId) : undefined;
    let limit = limitParam ? Number(limitParam) : 25;
    if (!Number.isFinite(limit) || limit <= 0) {
      limit = 25;
    }
    return this.realtimeService.getRecentEvents(id, companyKey, limit);
  }

  @Get('wait-time-stats')
  async getWaitTimeStats(
    @Query('company_id') companyId?: string,
    @Query('company_key') companyKey?: string,
    @Query('hours') hoursParam?: string,
  ): Promise<any> {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 6;
    if (!Number.isFinite(hours) || hours <= 0) {
      hours = 6;
    }
    return this.realtimeService.getWaitTimeStats(id, companyKey, hours);
  }

  @Get('top-doctors')
  async topDoctors(
    @Query('company_id') companyId?: string,
    @Query('hours') hoursParam?: string,
  ) {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 12;
    if (!Number.isFinite(hours) || hours <= 0) hours = 12;
    return this.realtimeService.getTopDoctorsRealtime(id, hours);
  }

  @Get('top-specialties')
  async topSpecialties(
    @Query('company_id') companyId?: string,
    @Query('hours') hoursParam?: string,
  ) {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 12;
    if (!Number.isFinite(hours) || hours <= 0) hours = 12;
    return this.realtimeService.getTopSpecialtiesRealtime(id, hours);
  }

  @Get('top-cid10')
  async topCID10(
    @Query('company_id') companyId?: string,
    @Query('hours') hoursParam?: string,
  ) {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 12;
    if (!Number.isFinite(hours) || hours <= 0) hours = 12;
    return this.realtimeService.getTopCID10Realtime(id, hours);
  }

  @Get('companies-leaderboard')
  async companiesLeaderboard(
    @Query('hours') hoursParam?: string,
  ) {
    let hours = hoursParam ? Number(hoursParam) : 12;
    if (!Number.isFinite(hours) || hours <= 0) hours = 12;
    return this.realtimeService.getCompaniesLeaderboardRealtime(hours);
  }

  @Get('stats')
  async consolidatedStats(
    @Query('company_id') companyId?: string,
    @Query('company_key') companyKey?: string,
    @Query('hours') hoursParam?: string,
  ) {
    const id = companyId ? Number(companyId) : undefined;
    let hours = hoursParam ? Number(hoursParam) : 6;
    if (!Number.isFinite(hours) || hours <= 0) hours = 6;
    return this.realtimeService.getConsolidatedStats(id, companyKey, hours);
  }
}