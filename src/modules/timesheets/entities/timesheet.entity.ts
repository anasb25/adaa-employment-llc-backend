import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { ProjectAllocation } from '../../project-allocations/entities/project-allocation.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Skill } from '../../skills/entities/skill.entity';

export enum AttendanceStatus {
  ACTIVE = 'active', // Employee was present as expected
  ON_HOLD = 'on_hold', // Employee was not present
  IDLE = 'idle', // Employee not allocated to any project (default)
}

@Entity('timesheets')
export class Timesheet extends BaseEntity {
  @Column({ nullable: true })
  allocationId: number | null; // Nullable for idle employees

  @Column({ nullable: true })
  employeeId: number | null; // Direct employee reference for idle employees

  @Column({ type: 'date' })
  date: Date;

  @Column()
  status: AttendanceStatus;

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
