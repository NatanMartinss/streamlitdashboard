import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('protocols')
export class Protocol {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, nullable: false })
  company_id: number;

  @Column({ type: 'varchar', length: 50, nullable: false, unique: true })
  protocol_code: string;

  @Column({ type: 'char', length: 36, nullable: false })
  person_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  person_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  person_registration: string | null;

  @Column({ type: 'datetime', nullable: true })
  arrival_time: Date | null;

  @Column({ type: 'datetime', nullable: true })
  start_attendance: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason_finished: string | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}