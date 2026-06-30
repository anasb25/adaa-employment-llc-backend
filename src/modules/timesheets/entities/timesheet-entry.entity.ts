import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Timesheet } from './timesheet.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Skill } from '../../skills/entities/skill.entity';
import { DateOnlyTransformer } from '../../../common/transformers/date.transformer';

@Entity('timesheet_entries')
@Index(['timesheetId', 'employeeId', 'date'], { unique: true })
export class TimesheetEntry extends BaseEntity {
  @Column({ type: 'integer' })
  timesheetId: number;

  @Column({ type: 'integer' })
  employeeId: number;

  @Column({ type: 'date', transformer: DateOnlyTransformer })
  date: string; // Date in YYYY-MM-DD format

  @Column({ type: 'integer', nullable: true })
  tradeInSiteId: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  hoursWorked: number;

  @Column({
    type: 'enum',
    enum: [
      'active',
      'annual_leave',
      'cancelled',
      'absconded',
      'absent',
      'sick_leave',
      'casual_leave',
      'urgent_leave',
      'notice_period',
      'resigned',
      'idle',
      'demobilized',
      'off',
    ],
    default: 'active',
  })
  jobStatus: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Relations
  @ManyToOne(() => Timesheet, (timesheet) => timesheet.entries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timesheetId' })
  timesheet: Timesheet;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @ManyToOne(() => Skill, { nullable: true })
  @JoinColumn({ name: 'tradeInSiteId' })
  tradeInSite: Skill | null;
}

