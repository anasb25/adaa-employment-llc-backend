import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities';
import { Project } from '../../projects/entities/project.entity';

@Entity('clients')
export class Client extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  contactNumber: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => Project, (project) => project.client)
  projects: Project[];
}


