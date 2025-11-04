import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Employee } from '../../employees/entities/employee.entity';
import { Skill } from '../../skills/entities/skill.entity';

@Entity('employee_skills')
@Unique(['employeeId', 'skillId'])
export class EmployeeSkill extends BaseEntity {
  @Column()
  employeeId: number;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  skillId: number;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: Skill;

  @Column({ type: 'int', default: 0 })
  rating: number;
}
