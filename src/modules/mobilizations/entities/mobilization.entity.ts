import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Employee } from '../../employees/entities/employee.entity';
import { Project } from '../../projects/entities/project.entity';
import { Skill } from '../../skills/entities/skill.entity';

export enum MobStatus {
  MOBILIZED = 'mobilized',
  DEMOBILIZED = 'demobilized',
}

export enum JobStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  ABSCONDED = 'absconded',
  ON_VACATION = 'on_vacation',
  ABSENT = 'absent',
  SICK_LEAVE = 'sick_leave',
  CASUAL_LEAVE = 'casual_leave',
  NOTICE_PERIOD = 'notice_period',
  RESIGNED = 'resigned',
  IDLE = 'idle',
}

@Entity('mobilizations')
export class Mobilization extends BaseEntity {
  @Column()
  employeeId: number;

  @Column()
  mobilizedTradeId: number; // The skill/trade they are mobilized as

  @Column({ nullable: true })
  projectId: number | null; // Null if demobilized/not on project

  @Column({
    type: 'enum',
    enum: MobStatus,
    default: MobStatus.DEMOBILIZED,
  })
  mobStatus: MobStatus;

  @Column({
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.ACTIVE,
  })
  jobStatus: JobStatus;

  @Column({ type: 'date' })
  actionDate: Date; // Date when this mobilization action occurred

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Relations
  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mobilizedTradeId' })
  mobilizedTrade: Skill;
}


