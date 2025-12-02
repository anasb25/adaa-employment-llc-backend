import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Client } from '../../clients/entities/client.entity';
import { ProjectSkill } from '../../project-skills/entities/project-skill.entity';

export enum ProjectStatus {
  PLANNED = 'planned',
  ONGOING = 'ongoing',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

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

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.PLANNED,
  })
  status: ProjectStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: ProjectFAT,
    nullable: true,
  })
  fat: ProjectFAT;

  @ManyToOne(() => Client, (client) => client.projects, { eager: false })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  clientId: number;

  @OneToMany(() => ProjectSkill, (projectSkill) => projectSkill.project)
  projectSkills: ProjectSkill[];
}
