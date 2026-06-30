import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from '../../projects/entities/project.entity';
import { Skill } from '../../skills/entities/skill.entity';

@Entity('project_skills')
@Unique(['projectId', 'skillId'])
export class ProjectSkill extends BaseEntity {
  @Column()
  projectId: number;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  skillId: number;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: Skill;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sale_price: number;
}
