import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { ProjectAllocation } from '../../project-allocations/entities/project-allocation.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Skill } from '../../skills/entities/skill.entity';

@Entity('timesheets')
export class Timesheet extends BaseEntity {
  @Column({ nullable: true })
  allocationId: number | null; // Nullable - keeping for backward compatibility

  @Column({ nullable: true })
  employeeId: number | null; // Direct employee reference

  @Column({ type: 'date' })
  date: Date;

  @Column({ nullable: true })
  tradeInSiteId: number | null; // The skill they actually worked as on site

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10.0 })
  hoursWorked: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => ProjectAllocation, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'allocationId' })
  allocation: ProjectAllocation | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee | null;

  @ManyToOne(() => Skill, { nullable: true })
  @JoinColumn({ name: 'tradeInSiteId' })
  tradeInSite: Skill | null;
}

// Keeping enum for backward compatibility during migration
export enum AttendanceStatus {
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  IDLE = 'idle',
}
