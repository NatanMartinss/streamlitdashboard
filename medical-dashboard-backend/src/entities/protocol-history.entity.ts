import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Protocol } from './protocol.entity';

@Entity('protocol_history')
export class ProtocolHistory {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, nullable: false })
  protocol_id: number;

  @Column({ type: 'datetime', nullable: false })
  ts: Date;

  // Usamos varchar para suportar todos os eventos reais do DAV
  // Exemplos: participantWaitingRoom, participantConnected, PERSON_ENTER_EMERGENCY,
  // PERSON_START_ATTENDANCE, PROFESSIONAL_START_ATTENDANCE, PERSON_FINISH_ATTENDANCE, PERSON_LEAVE_EMERGENCY
  @Column({ type: 'varchar', length: 64, nullable: false })
  step: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  next_group: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  professional_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  professional_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  professional_crm: string | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  person_present: number | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  professional_present: number | null;

  @Column({ type: 'char', length: 36, nullable: true })
  appointment_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  complaint: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  place_in_line: string | null;

  @ManyToOne(() => Protocol, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'protocol_id' })
  protocol: Protocol;
}