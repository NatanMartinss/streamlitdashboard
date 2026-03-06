import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Company } from './company.entity';

@Entity('files')
export class File {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'char', length: 36, nullable: false })
  appointment_id: string;

  @Column({ type: 'int', unsigned: true, nullable: false })
  company_id: number;

  @Column({ type: 'datetime', nullable: true })
  file_date: Date;

  @Column({ type: 'text', nullable: true })
  encoded: string;

  @Column({ type: 'text', nullable: true })
  file_path: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name_original: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  participant: string;

  // Relacionamentos
  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}