import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from '../../projects/entities/project.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  SENT = 'sent',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('invoices')
@Index(['projectId', 'month'], { unique: true })
export class Invoice extends BaseEntity {
  @Column({ unique: true })
  invoiceNumber: string; // e.g., "DSID-0555"

  @Column({ type: 'integer' })
  projectId: number;

  @ManyToOne(() => Project, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ length: 7 }) // Format: YYYY-MM
  month: string;

  @Column({ type: 'date' })
  invoiceDate: Date;

  @Column({ type: 'date' })
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  subject: string; // e.g., "ADAA MANPOWER LABOR SUPPLY SERVICES FOR THE MONTH OF JUL-2022"

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Detailed line items breakdown by skill/trade
  @Column({ type: 'jsonb' })
  lineItems: Array<{
    skillName: string; // e.g., "CARPENTER", "HELPER"
    skillId: number;
    rateVariants: Array<{
      variantName: string; // e.g., "STD HRS", "NATIONAL HOLIDAY HRS", "SUNDAY HOLIDAY HRS"
      hours: number;
      ratePerHour: number; // Client rate
      taxPercentage: number;
      taxAmount: number;
      amount: number; // Before tax
    }>;
    subtotal: number; // Sum of all variant amounts for this skill
  }>;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalTaxableAmount: number; // Total before tax

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalTax: number; // Always 5% of totalTaxableAmount

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number; // Grand total including tax

  @Column({ type: 'text', nullable: true })
  totalInWords: string; // e.g., "AED Forty-Five Thousand Six Hundred Seventy and Eighty Fils"

  @Column({ type: 'date', nullable: true })
  paidDate: Date;

  @Column({ type: 'text', nullable: true })
  paymentReference: string | null;

  @Column({ type: 'date', nullable: true })
  approvedDate: Date;

  @Column({ type: 'integer', nullable: true })
  approvedBy: number;

  @Column({ type: 'date', nullable: true })
  sentDate: Date;
}
