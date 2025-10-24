import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      relations: ['role', 'role.permissions'],
    });
  }

  async findOne(id: number): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'role.permissions'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email },
      relations: ['role', 'role.permissions'],
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return await this.userRepository.save(user);
  }

  async update(id: number, userData: Partial<User>): Promise<User> {
    await this.userRepository.update(id, userData);
    return (await this.findOne(id)) as User;
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.softDelete(id);
  }

  async assignRole(userId: number, roleId: number): Promise<User> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const role = await this.roleRepository.findOne({ where: { id: roleId } });
    if (!role) {
      throw new Error('Role not found');
    }

    user.role = role;
    user.roleId = roleId;

    return await this.userRepository.save(user);
  }

  async getUserPermissions(userId: number): Promise<string[]> {
    const user = await this.findOne(userId);
    if (!user || !user.role) {
      return [];
    }

    return user.role.permissions?.map((permission) => permission.name) || [];
  }
}
