import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  findAll(): Promise<Supplier[]> {
    return this.supplierRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }
    return supplier;
  }

  async create(data: Partial<Supplier>): Promise<Supplier> {
    const name = data.name?.trim();
    if (!name) {
      throw new BadRequestException('Supplier name is required');
    }

    const existing = await this.supplierRepository.findOne({
      where: { name },
    });
    if (existing) {
      throw new BadRequestException('A supplier with this name already exists');
    }

    const supplier = this.supplierRepository.create({
      ...data,
      name,
    });
    return this.supplierRepository.save(supplier);
  }

  async update(id: number, data: Partial<Supplier>): Promise<Supplier> {
    const supplier = await this.findOne(id);

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new BadRequestException('Supplier name is required');
      }

      const duplicate = await this.supplierRepository.findOne({
        where: { name },
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(
          'A supplier with this name already exists',
        );
      }

      supplier.name = name;
    }

    if (data.updatedBy !== undefined) {
      supplier.updatedBy = data.updatedBy;
    }

    return this.supplierRepository.save(supplier);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.supplierRepository.delete(id);
  }
}
