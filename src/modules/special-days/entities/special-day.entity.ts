import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities';

@Entity('special_days')
@Index(['startDate', 'endDate'])
export class SpecialDay extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  category: string; // Flexible category like "Public Holiday", "Ramadan", "National Day", etc.

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date; // For date ranges like Ramadan

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isRecurring: boolean; // For annually recurring holidays

  @Column({ nullable: true })
  color: string; // Hex color for UI display
}

