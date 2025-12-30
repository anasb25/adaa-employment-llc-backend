import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from './project.entity';
import { SpecialDay } from '../../special-days/entities/special-day.entity';

/**
 * Stores project-specific client rate multipliers for special days.
 * Employee multipliers remain global (from SpecialDay entity).
 */
@Entity('project_special_day_rates')
@Unique(['projectId', 'specialDayId'])
export class ProjectSpecialDayRate extends BaseEntity {
  @ManyToOne(() => Project, (project) => project.specialDayRates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: number;

  @ManyToOne(() => SpecialDay, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'specialDayId' })
  specialDay: SpecialDay;

  @Column()
  specialDayId: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1.0,
    comment: 'Client rate multiplier for this special day on this project (e.g., 1.10 = 110%)',
  })
  clientRateMultiplier: number;
}

