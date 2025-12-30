import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from '../../projects/entities/project.entity';
import { Skill } from '../../skills/entities/skill.entity';
import { RateVariant } from '../../rate-variants/entities/rate-variant.entity';

export enum RateType {
  FLAT = 'flat', // Fixed amount per hour
  MULTIPLIER = 'multiplier', // Multiplier of base rate
}

@Entity('project_skill_rates')
@Index(['projectId', 'skillId', 'rateVariantId'], { unique: true })
export class ProjectSkillRate extends BaseEntity {
  @Column()
  projectId: number;

  @Column()
  skillId: number;

  @Column()
  rateVariantId: number;

  @Column({
    type: 'enum',
    enum: RateType,
    default: RateType.FLAT,
  })
  rateType: RateType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rateValue: number; // If FLAT: AED per hour, If MULTIPLIER: multiplier (e.g., 1.2)

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: Skill;

  @ManyToOne(() => RateVariant)
  @JoinColumn({ name: 'rateVariantId' })
  rateVariant: RateVariant;
}


