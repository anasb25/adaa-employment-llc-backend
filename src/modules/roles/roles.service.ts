import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async findAll(): Promise<Role[]> {
    return await this.roleRepository.find({
      relations: ['permissions'],
    });
  }

  async findOne(id: number): Promise<Role | null> {
    return await this.roleRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });
  }

  async findByName(name: string): Promise<Role | null> {
    return await this.roleRepository.findOne({
      where: { name },
      relations: ['permissions'],
    });
  }

  async create(roleData: Partial<Role>): Promise<Role> {
    const role = this.roleRepository.create(roleData);
    return await this.roleRepository.save(role);
  }

  async update(id: number, roleData: Partial<Role>): Promise<Role> {
    await this.roleRepository.update(id, roleData);
    return (await this.findOne(id)) as Role;
  }

  async remove(id: number): Promise<void> {
    await this.roleRepository.delete(id);
  }

  async assignPermissions(
    roleId: number,
    permissionIds: number[],
  ): Promise<Role> {
    const role = await this.findOne(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    const permissions =
      await this.permissionRepository.findByIds(permissionIds);
    role.permissions = permissions;

    return await this.roleRepository.save(role);
  }
}
