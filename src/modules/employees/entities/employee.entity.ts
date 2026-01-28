import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { EmployeeSkill } from '../../employee-skills/entities/employee-skill.entity';
import { DateOnlyTransformer } from '../../../common/transformers/date.transformer';

export enum EmployeeStatus {
  ACTIVE = 'active',
  ANNUAL_LEAVE = 'annual_leave',
}

@Entity('employees')
export class Employee extends BaseEntity {
  @Column({ unique: true })
  adaa_emp_code: string;

  @Column()
  name: string;

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  dob: string | null; // Date in YYYY-MM-DD format

  @Column({ nullable: true, unique: true })
  pp_no: string;

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  pp_expiry: string | null; // Date in YYYY-MM-DD format

  @Column({ nullable: true })
  nationality: string;

  @Column({ nullable: true, unique: true })
  emirates_id: string;

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  emirates_id_expiry: string | null; // Date in YYYY-MM-DD format

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  visa_expiry: string | null; // Date in YYYY-MM-DD format

  @Column({ nullable: true, unique: true })
  work_permit_no: string;

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  work_permit_expiry: string | null; // Date in YYYY-MM-DD format

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

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  date_of_joining: string | null; // Date in YYYY-MM-DD format

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  date_of_arrival: string | null; // Date in YYYY-MM-DD format

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: 'Employee basic salary' })
  basic_salary: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: 'House Rent Allowance' })
  hra: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: 'Other allowances' })
  other_allowance: number | null;

  @Column({ type: 'int', default: 0, comment: 'Air tickets count - auto-increments every year from date of joining' })
  air_tickets: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, comment: 'Annual leave balance in days - auto-adds 30 days every year from date of joining' })
  annual_leave_balance: number;

  @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.employee)
  employeeSkills: EmployeeSkill[];
}
