import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities';

@Entity('rate_variants')
export class RateVariant extends BaseEntity {
  @Column({ unique: true })
  name: string; // e.g., "Regular", "Overtime", "Night Shift", "Weekend"

  @Column({ nullable: true })
  description: string; // e.g., "Standard 10 hours", ">10 hours", "10pm-6am"

  @Column({ type: 'integer', default: 0 })
  displayOrder: number; // For UI sorting

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  color: string; // For UI display

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1.0,
    comment: 'Employee rate multiplier for this rate variant (e.g., 1.05 = 105% = 5% extra pay to employee)',
  })
  employeeRateMultiplier: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1.0,
    comment:
      'Global client rate multiplier for this rate variant (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.',
  })
  clientRateMultiplier: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Minimum hours for this rate variant to apply (null = no minimum, e.g., for ">10 hours" set minHours=10)',
  })
  minHours: number | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    comment: 'Maximum hours for this rate variant to apply (null = no maximum, e.g., for "<5 hours" set maxHours=5)',
  })
  maxHours: number | null;

  @Column({
    default: false,
    comment: 'System-defined variant that cannot be deleted or edited (except multiplier)',
  })
  isSystem: boolean;
}


