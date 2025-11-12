import { Entity, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { EmployeeSkill } from '../../employee-skills/entities/employee-skill.entity';
import { SkillType } from './skill-type.entity';

@Entity('skills')
export class Skill extends BaseEntity {
  @Column()
  skill: string;

  @ManyToOne(() => SkillType, (skillType) => skillType.skills, { eager: false })
  @JoinColumn({ name: 'skillTypeId' })
  skillType: SkillType;

  @Column({ nullable: true })
  skillTypeId: number;

  @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.skill)
  employeeSkills: EmployeeSkill[];
}
