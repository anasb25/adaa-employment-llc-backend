import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<User>> {
    return await PaginationUtil.paginate(this.userRepository, options, {
      relations: ['role', 'role.permissions'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchUsers(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<User>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.userRepository, options, {
      relations: ['role', 'role.permissions'],
      where: [
        { firstName: ILike(searchTerm) },
        { lastName: ILike(searchTerm) },
        { email: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async updateUserStatus(
    id: number,
    isActive: boolean,
  ): Promise<{ message: string; user: User }> {
    const user = await this.findOne(id);
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = isActive;
    const updatedUser = await this.userRepository.save(user);

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser,
    };
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
