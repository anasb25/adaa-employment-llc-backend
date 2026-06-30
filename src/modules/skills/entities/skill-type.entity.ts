import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Skill } from './skill.entity';

@Entity('skill_types')
export class SkillType extends BaseEntity {
  @Column({ unique: true })
  type: string;

  @OneToMany(() => Skill, (skill) => skill.skillType)
  skills: Skill[];
}
