import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Client } from '../../clients/entities/client.entity';
import { ProjectSkill } from '../../project-skills/entities/project-skill.entity';
import { ProjectSpecialDayRate } from './project-special-day-rate.entity';
import { ProjectRateVariantRate } from './project-rate-variant-rate.entity';

export enum ProjectFAT {
  ADAA = 'ADAA',
  CLIENT = 'CLIENT',
}

@Entity('projects')
export class Project extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: ProjectFAT,
    nullable: true,
  })
  fat: ProjectFAT;

  @Column({ type: 'jsonb', nullable: true })
  offDays: string[];

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    default: 1.0,
    comment: 'Client rate multiplier when employee works on project off days (e.g., 1.25 = 125%)',
  })
  offDayMultiplier: number;

  @ManyToOne(() => Client, (client) => client.projects, { eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  clientId: number;

  @OneToMany(() => ProjectSkill, (projectSkill) => projectSkill.project)
  projectSkills: ProjectSkill[];

  @OneToMany(
    () => ProjectSpecialDayRate,
    (projectSpecialDayRate) => projectSpecialDayRate.project,
  )
  specialDayRates: ProjectSpecialDayRate[];

  @OneToMany(
    () => ProjectRateVariantRate,
    (projectRateVariantRate) => projectRateVariantRate.project,
  )
  rateVariantRates: ProjectRateVariantRate[];
}
