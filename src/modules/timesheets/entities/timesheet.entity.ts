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
@Index(['projectId', 'month'], { unique: true })
export class Timesheet extends BaseEntity {
  @Column({ type: 'integer' })
  projectId: number;

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

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @OneToMany(() => TimesheetEntry, (entry) => entry.timesheet)
  entries: TimesheetEntry[];
}
