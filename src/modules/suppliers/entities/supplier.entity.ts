import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Employee } from '../../employees/entities/employee.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ unique: true })
  name: string;

  @OneToMany(() => Employee, (employee) => employee.supplier)
  employees: Employee[];
}
