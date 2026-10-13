import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { attachUserPermissions } from '../../common/utils/role-access.util';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly configService: ConfigService,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<User>> {
    const result = await PaginationUtil.paginate(this.userRepository, options, {
      relations: ['role', 'role.permissions'],
      order: { createdAt: 'DESC' },
    });
    await attachUserPermissions(this.userRepository, result.data);
    return result;
  }

  async searchUsers(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<User>> {
    const searchTerm = `%${query}%`;

    const result = await PaginationUtil.paginate(this.userRepository, options, {
      relations: ['role', 'role.permissions'],
      where: [
        { firstName: ILike(searchTerm) },
        { lastName: ILike(searchTerm) },
        { email: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
    await attachUserPermissions(this.userRepository, result.data);
    return result;
  }

  async updateUserStatus(
    id: number,
    isActive: boolean,
    currentUserId?: number,
  ): Promise<{ message: string; user: User }> {
    const user = await this.findOne(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent users from deactivating themselves
    if (currentUserId && id === currentUserId && !isActive) {
      throw new Error('You cannot deactivate your own account');
    }

    user.isActive = isActive;
    const updatedUser = await this.userRepository.save(user);

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser,
    };
  }

  async findOne(id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['role', 'role.permissions'],
    });
    await attachUserPermissions(this.userRepository, [user]);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['role', 'role.permissions'],
    });
    await attachUserPermissions(this.userRepository, [user]);
    return user;
  }

  async create(userData: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    roleId: number;
  }): Promise<User> {
    const email = userData.email?.trim().toLowerCase();
    const firstName = userData.firstName?.trim();
    const lastName = userData.lastName?.trim();
    const password = userData.password;
    const roleId = Number(userData.roleId);

    if (!email || !firstName || !lastName || !password || !roleId) {
      throw new BadRequestException(
        'Email, first name, last name, password, and role are required',
      );
    }
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const existing = await this.userRepository.findOne({
      where: { email: ILike(email) },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) {
      throw new BadRequestException('Invalid role');
    }

    const user = this.userRepository.create({
      email,
      firstName,
      lastName,
      password: await this.hashPassword(password),
      roleId,
      role,
      permissions: role.permissions ?? [],
      isActive: true,
    });
    const saved = await this.userRepository.save(user);
    return (await this.findOne(saved.id)) as User;
  }

  private async hashPassword(password: string): Promise<string> {
    const rounds = this.configService.get<number>('auth.bcryptRounds') || 12;
    return await bcrypt.hash(password, rounds);
  }

  async updateUser(
    id: number,
    userData: {
      email?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
      roleId?: number;
    },
  ): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (userData.email !== undefined) {
      const email = userData.email.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException('Email is required');
      }
      const existing = await this.userRepository.findOne({
        where: { email: ILike(email) },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('A user with this email already exists');
      }
      user.email = email;
    }

    if (userData.firstName !== undefined) {
      const firstName = userData.firstName.trim();
      if (!firstName) {
        throw new BadRequestException('First name is required');
      }
      user.firstName = firstName;
    }

    if (userData.lastName !== undefined) {
      const lastName = userData.lastName.trim();
      if (!lastName) {
        throw new BadRequestException('Last name is required');
      }
      user.lastName = lastName;
    }

    if (userData.password) {
      if (userData.password.length < 6) {
        throw new BadRequestException('Password must be at least 6 characters');
      }
      user.password = await this.hashPassword(userData.password);
    }

    if (userData.roleId !== undefined) {
      const roleId = Number(userData.roleId);
      const role = await this.roleRepository.findOne({
        where: { id: roleId },
        relations: ['permissions'],
      });
      if (!role) {
        throw new BadRequestException('Invalid role');
      }
      user.role = role;
      user.roleId = roleId;
      user.permissions = role.permissions ?? [];
    }

    await this.userRepository.save(user);
    return (await this.findOne(id)) as User;
  }

  async remove(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async assignRole(userId: number, roleId: number): Promise<User> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    user.role = role;
    user.roleId = roleId;
    user.permissions = role.permissions ?? [];

    return await this.userRepository.save(user);
  }

  /** Copy the role's current permissions onto this user without changing the role. */
  async applyRolePermissions(userId: number, roleId: number): Promise<User> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    user.permissions = role.permissions ?? [];
    return await this.userRepository.save(user);
  }

  async getUserPermissions(userId: number): Promise<string[]> {
    const user = await this.findOne(userId);
    if (!user) {
      return [];
    }

    return user.role?.permissions?.map((permission) => permission.name) || [];
  }
}
