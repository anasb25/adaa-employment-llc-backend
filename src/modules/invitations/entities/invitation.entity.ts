import { User } from 'src/modules/users/entities/user.entity';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from 'src/common/entities';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('invitations')
export class Invitation extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  token: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'json', nullable: true })
  permissions: string[];

  @Column()
  role: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'inviterId' })
  inviter: User;

  @Column()
  inviterId: number;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'acceptedById' })
  acceptedBy: User;

  @Column({ nullable: true })
  acceptedById: number;
}
