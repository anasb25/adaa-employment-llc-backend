import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from '../../projects/entities/project.entity';
import { TimesheetEntry } from './timesheet-entry.entity';

export enum TimesheetStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('timesheets')
export class Timesheet extends BaseEntity {
  @Column({ type: 'integer', nullable: true })
  projectId: number | null; // null = "Idle Employees" timesheet for the month

  @Column({ length: 7 }) // Format: YYYY-MM
  month: string;

  @Column({
    type: 'enum',
    enum: TimesheetStatus,
    default: TimesheetStatus.DRAFT,
  })
  status: TimesheetStatus;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  submittedBy: number | null;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  approvedBy: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Relations (project is null for idle-employees timesheet)
  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @OneToMany(() => TimesheetEntry, (entry) => entry.timesheet)
  entries: TimesheetEntry[];
}
