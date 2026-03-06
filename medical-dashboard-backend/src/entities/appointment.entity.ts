import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('appointments')
export class Appointment {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'int', unsigned: true, nullable: false })
  company_id: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  status_appointment: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  appointment_specialty: string;

  @Column({ type: 'datetime', nullable: true })
  schedule_date_time: Date;

  @Column({ type: 'datetime', nullable: true })
  executed_date_time: Date;

  @Column({ type: 'int', nullable: true })
  total_appointment_time: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  cid10_code: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  cid10_category: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  cid10_subcategory: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cid10_value: string;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  detailed: boolean;

  // Relacionamento com Company
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}