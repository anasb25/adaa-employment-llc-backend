import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { EmployeeSkill } from '../../employee-skills/entities/employee-skill.entity';

export enum EmployeeStatus {
  ACTIVE = 'active',
  ON_VACATION = 'on_vacation',
}

@Entity('employees')
export class Employee extends BaseEntity {
  @Column({ unique: true })
  adaa_emp_code: string;

  @Column()
  name: string;

  @Column({ type: 'date', nullable: true })
  dob: Date;

  @Column({ nullable: true, unique: true })
  pp_no: string;

  @Column({ type: 'date', nullable: true })
  pp_expiry: Date;

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true, unique: true })
  emirates_id: string;

  @Column({ type: 'date', nullable: true })
  emirates_id_expiry: Date;

  @Column({ type: 'date', nullable: true })
  visa_expiry: Date;

  @Column({ nullable: true, unique: true })
  work_permit_no: string;

  @Column({ type: 'date', nullable: true })
  work_permit_expiry: Date;

  @Column({ nullable: true, unique: true })
  personal_code: string;

  @Column({ nullable: true })
  contact_no: string;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    default: EmployeeStatus.ACTIVE,
  })
  status: EmployeeStatus;

  @Column({ type: 'date', nullable: true })
  date_of_joining: Date;

  @Column({ type: 'date', nullable: true })
  date_of_arrival: Date;

  @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.employee)
  employeeSkills: EmployeeSkill[];
}
