import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities';

@Entity('rate_variants')
export class RateVariant extends BaseEntity {
  @Column({ unique: true })
  name: string; // e.g., "Regular", "Overtime", "Night Shift", "Weekend"

  @Column({ nullable: true })
  description: string; // e.g., "Standard 10 hours", ">10 hours", "10pm-6am"

  @Column({ default: false })
  isBaseRate: boolean; // Only one should be true - the base/regular rate

  @Column({ type: 'integer', default: 0 })
  displayOrder: number; // For UI sorting

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  color: string; // For UI display
}


