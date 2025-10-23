import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: 'user' })
  role: string;

  @Column('simple-array', { nullable: true })
  permissions: string[];

  @Column({ default: true })
  isActive: boolean;
}
