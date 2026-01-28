import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Employee } from '../../employees/entities/employee.entity';

export enum ContractType {
  LIMITED = 'LIMITED',
  UNLIMITED = 'UNLIMITED',
}

export enum SettlementStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export interface PaymentItem {
  description: string;
  forDays?: number;
  fromDate?: string;
  toDate?: string;
  amount: number;
}

export interface DeductionItem {
  description: string;
  amount: number;
}

@Entity('settlements')
export class Settlement extends BaseEntity {
  @Column()
  employeeId: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  // Employee details at time of settlement
  @Column()
  empCode: string;

  @Column()
  empName: string;

  @Column({ nullable: true })
  jobTitle: string;

  @Column({ type: 'date', nullable: true })
  dateOfJoin: string;

  @Column({ type: 'date', nullable: true })
  lastDateOfWork: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  lastTotalSalary: number;

  @Column({ type: 'int', default: 0 })
  totalDaysAbsent: number;

  // Last month salary payment status
  @Column({ type: 'boolean', default: false })
  lastMonthSalaryPaid: boolean;

  // Gratuity eligibility
  @Column({ default: false })
  eligibleForGratuity: boolean;

  @Column({ type: 'int', nullable: true, default: 21 })
  gratuityDaysPerYear: number;

  @Column({ type: 'text', nullable: true })
  gratuityReason: string;

  // Salary breakdown
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlySalary: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  allowance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  transportAllowance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  otherAllowances: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  totalYearsOfService: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  annualLeaveBalance: number;

  @Column({
    type: 'enum',
    enum: ContractType,
    nullable: true,
  })
  contractType: ContractType;

  // Payment and deduction details (stored as JSON)
  @Column({ type: 'jsonb', default: [] })
  paymentItems: PaymentItem[];

  @Column({ type: 'jsonb', default: [] })
  deductionItems: DeductionItem[];

  // Calculated totals
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDue: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDeduction: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  finalAmount: number;

  // Acknowledgment details
  @Column({ nullable: true })
  passportNo: string;

  // Status and workflow
  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.DRAFT,
  })
  status: SettlementStatus;

  // Approval tracking
  @Column({ nullable: true })
  preparedBy: number;

  @Column({ nullable: true })
  checkedBy: number;

  @Column({ nullable: true })
  approvedBy: number;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;
}

