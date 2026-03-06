import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Company } from './company.entity';

@Entity('appointment_participants')
export class AppointmentParticipant {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'char', length: 36, nullable: false })
  appointment_id: string;

  @Column({ type: 'int', unsigned: true, nullable: false })
  company_id: number;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  role: string;

  @Column({ type: 'datetime', nullable: true })
  start_date_time: Date;

  @Column({ type: 'datetime', nullable: true })
  end_date_time: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  council_type: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  council_number: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  council_region: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string;

  // Relacionamentos
  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}