import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async findAll(): Promise<Permission[]> {
    return await this.permissionRepository.find();
  }

  async findOne(id: number): Promise<Permission | null> {
    return await this.permissionRepository.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<Permission | null> {
    return await this.permissionRepository.findOne({ where: { name } });
  }

  async create(permissionData: Partial<Permission>): Promise<Permission> {
    const permission = this.permissionRepository.create(permissionData);
    return await this.permissionRepository.save(permission);
  }

  async update(
    id: number,
    permissionData: Partial<Permission>,
  ): Promise<Permission> {
    await this.permissionRepository.update(id, permissionData);
    return (await this.findOne(id)) as Permission;
  }

  async remove(id: number): Promise<void> {
    await this.permissionRepository.delete(id);
  }

  async createMultiple(
    permissions: Partial<Permission>[],
  ): Promise<Permission[]> {
    const createdPermissions = this.permissionRepository.create(permissions);
    return await this.permissionRepository.save(createdPermissions);
  }
}
