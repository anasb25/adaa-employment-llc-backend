import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from './project.entity';
import { RateVariant } from '../../rate-variants/entities/rate-variant.entity';

/**
 * Stores project-specific client rate multipliers for rate variants.
 * Employee multipliers remain global (from RateVariant entity).
 */
@Entity('project_rate_variant_rates')
@Unique(['projectId', 'rateVariantId'])
export class ProjectRateVariantRate extends BaseEntity {
  @ManyToOne(() => Project, (project) => project.rateVariantRates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: number;

  @ManyToOne(() => RateVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rateVariantId' })
  rateVariant: RateVariant;

  @Column()
  rateVariantId: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1.0,
    comment: 'Client rate multiplier for this rate variant on this project (e.g., 1.10 = 110%)',
  })
  clientRateMultiplier: number;

  @Column({
    type: 'boolean',
    default: true,
    comment:
      'When false, the rate variant is not applied to this project ' +
      '(the variant is skipped during invoice and payroll calculations).',
  })
  isEnabled: boolean;
}

