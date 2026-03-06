import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentParticipant } from '../../entities/appointment-participant.entity';
import { Company } from '../../entities/company.entity';
import { Protocol } from '../../entities/protocol.entity';
import { ProtocolHistory } from '../../entities/protocol-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentParticipant,
      Company,
      Protocol,
      ProtocolHistory,
    ]),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}