import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'protocol_events' })
@Index(['companyId', 'timestamp'])
@Index(['companyKey', 'timestamp'])
@Index(['protocol'])
export class ProtocolEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId?: number;

  @Column({ name: 'company_key', type: 'varchar', length: 100, nullable: true })
  companyKey?: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  protocol?: string;

  @Column({ name: 'appointment_id', type: 'varchar', length: 255, nullable: true })
  appointmentId?: string;

  @Column({ name: 'participant_id', type: 'varchar', length: 255, nullable: true })
  participantId?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cpf?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  event?: string;

  @Column({ name: 'next_group', type: 'varchar', length: 255, nullable: true })
  nextGroup?: string;

  @Column({ name: 'professional_id', type: 'varchar', length: 255, nullable: true })
  professionalId?: string;

  @Column({ name: 'professional_name', type: 'varchar', length: 255, nullable: true })
  professionalName?: string;

  @Column({ name: 'professional_license', type: 'varchar', length: 255, nullable: true })
  professionalLicense?: string;

  @Column({ type: 'datetime', nullable: false })
  timestamp: Date;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

