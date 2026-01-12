import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { DateOnlyTransformer } from '../../../common/transformers/date.transformer';

export enum SpecialDayType {
  MANDATORY_OFF = 'mandatory_off', // Must be off (e.g., government mandated holidays)
  OPTIONAL_OFF = 'optional_off', // Default off but can work with premium rates
  PREMIUM_RATE = 'premium_rate', // Working day with premium billing rates
  REGULAR = 'regular', // Just marked for reference, no special treatment
}

@Entity('special_days')
@Index(['startDate', 'endDate'])
export class SpecialDay extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  category: string; // Flexible category like "Public Holiday", "Ramadan", "National Day", etc.

  @Column({ type: 'date', transformer: DateOnlyTransformer })
  startDate: string; // Date in YYYY-MM-DD format

  @Column({ type: 'date', nullable: true, transformer: DateOnlyTransformer })
  endDate: string | null; // For date ranges like Ramadan (YYYY-MM-DD format)

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isRecurring: boolean; // For annually recurring holidays

  @Column({ nullable: true })
  color: string; // Hex color for UI display

  // NEW FIELDS for rate management
  @Column({
    type: 'enum',
    enum: SpecialDayType,
    default: SpecialDayType.REGULAR,
  })
  dayType: SpecialDayType;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 1.0 })
  employeeRateMultiplier: number; // e.g., 1.05 = 105% (5% extra pay to employee)

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1.0,
    comment:
      'Global client rate multiplier for this special day (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.',
  })
  clientRateMultiplier: number;

  @Column({ default: false })
  isDefaultOff: boolean; // If true, default to off status (but can be overridden if not mandatory)

  @Column({ type: 'text', nullable: true })
  notes: string; // Internal notes for admins
}
