import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('dashboard_data')
@Index('uniq_company_period', ['company_id', 'start_date', 'end_date'], { unique: true })
export class DashboardData {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true })
  company_id: number;

  @Column({ type: 'date' })
  start_date: string; // YYYY-MM-DD

  @Column({ type: 'date' })
  end_date: string; // YYYY-MM-DD

  @Column({ type: 'int', default: 0 })
  counts_total: number;

  @Column({ type: 'int', default: 0 })
  counts_medicas: number;

  @Column({ type: 'int', default: 0 })
  counts_confirmacoes: number;

  @Column({ type: 'json', nullable: true })
  day_of_week: any;

  @Column({ type: 'json', nullable: true })
  hour_of_day: any;

  @Column({ type: 'json', nullable: true })
  wait_times: any;

  @Column({ type: 'json', nullable: true })
  service_times: any;

  @Column({ type: 'json', nullable: true })
  top_doctors: any;

  @Column({ type: 'json', nullable: true })
  top_specialties: any;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}