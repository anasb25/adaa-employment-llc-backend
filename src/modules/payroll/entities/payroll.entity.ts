import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Employee } from '../../employees/entities/employee.entity';

@Entity('payrolls')
@Index(['employeeId', 'month'], { unique: true })
export class Payroll extends BaseEntity {
  @Column({ type: 'integer' })
  employeeId: number;

  @Column({ length: 7 }) // Format: YYYY-MM
  month: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalHours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalOtHours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalOffdaysWorkedHours: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalIdleDayHours: number;

  @Column({ type: 'jsonb', nullable: true })
  allowances: Record<string, any>;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  absentDaysDeductible: number;

  @Column({ type: 'jsonb', nullable: true })
  otherDeductions: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Detailed breakdown of hours and amounts
  @Column({ type: 'jsonb', nullable: true })
  hoursBreakdown: {
    regular: Array<{
      rateVariantName: string;
      hours: number;
      rateMultiplier: number;
      hourlyRate: number;
      amount: number;
    }>;
    specialDays: Array<{
      specialDayName: string;
      hours: number;
      rateMultiplier: number;
      hourlyRate: number;
      amount: number;
    }>;
    offDays: Array<{
      date: string;
      hours: number;
      rateMultiplier: number;
      hourlyRate: number;
      amount: number;
    }>;
    idle: Array<{
      date: string;
      hours: number;
      rateMultiplier: number;
      hourlyRate: number;
      amount: number;
    }>;
  };

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseHourlyRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalGrossSalary: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Net salary after all additions and deductions',
  })
  netSalary: number | null;

  // Relations
  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;
}
