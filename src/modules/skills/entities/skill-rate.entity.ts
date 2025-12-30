import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Skill } from './skill.entity';
import { RateVariant } from '../../rate-variants/entities/rate-variant.entity';

export enum RateType {
  FLAT = 'flat',
  MULTIPLIER = 'multiplier',
}

@Entity('skill_rates')
@Index(['skillId', 'rateVariantId'], { unique: true })
export class SkillRate extends BaseEntity {
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
  employeeRateValue: number; // What we pay the employee (replaces cost_price)

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  clientRateValue: number; // What we charge the client (replaces sale_price)

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relations
  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: Skill;

  @ManyToOne(() => RateVariant)
  @JoinColumn({ name: 'rateVariantId' })
  rateVariant: RateVariant;
}


