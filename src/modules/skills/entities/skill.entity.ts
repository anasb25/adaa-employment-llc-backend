import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { EmployeeSkill } from '../../employee-skills/entities/employee-skill.entity';

@Entity('skills')
export class Skill extends BaseEntity {
  @Column()
  type: string;

  @Column()
  skill: string;

  @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.skill)
  employeeSkills: EmployeeSkill[];
}

