import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProtocolEvent, Appointment, AppointmentParticipant, Company, Protocol, ProtocolHistory } from '../entities';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProtocolEvent, Appointment, AppointmentParticipant, Company, Protocol, ProtocolHistory])],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}

