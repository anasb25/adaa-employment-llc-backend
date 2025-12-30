import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { EmployeeSkill } from './employee-skill.entity';
import { RateVariant } from '../../rate-variants/entities/rate-variant.entity';

export enum RateType {
  FLAT = 'flat',
  MULTIPLIER = 'multiplier',
}

@Entity('employee_skill_rates')
@Index(['employeeSkillId', 'rateVariantId'], { unique: true })
export class EmployeeSkillRate extends BaseEntity {
  @Column()
  employeeSkillId: number;

  @Column()
  rateVariantId: number;

  @Column({
    type: 'enum',
    enum: RateType,
    default: RateType.FLAT,
  })
  rateType: RateType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rateValue: number; // Employee pay rate for this variant

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relations
  @ManyToOne(() => EmployeeSkill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeSkillId' })
  employeeSkill: EmployeeSkill;

  @ManyToOne(() => RateVariant)
  @JoinColumn({ name: 'rateVariantId' })
  rateVariant: RateVariant;
}


