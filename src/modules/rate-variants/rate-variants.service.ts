import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVariant } from './entities/rate-variant.entity';
import { CreateRateVariantDto } from './dto/create-rate-variant.dto';
import { UpdateRateVariantDto } from './dto/update-rate-variant.dto';

@Injectable()
export class RateVariantsService {
  constructor(
    @InjectRepository(RateVariant)
    private rateVariantRepository: Repository<RateVariant>,
  ) {}

  async create(
    createDto: CreateRateVariantDto,
    createdBy: number,
  ): Promise<RateVariant> {
    const rateVariant = this.rateVariantRepository.create({
      ...createDto,
      createdBy,
    });

    return await this.rateVariantRepository.save(rateVariant);
  }

  async findAll(): Promise<RateVariant[]> {
    return await this.rateVariantRepository.find({
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<RateVariant> {
    const rateVariant = await this.rateVariantRepository.findOne({
      where: { id },
    });

    if (!rateVariant) {
      throw new NotFoundException('Rate variant not found');
    }

    return rateVariant;
  }

  async update(
    id: number,
    updateDto: UpdateRateVariantDto,
    updatedBy: number,
  ): Promise<RateVariant> {
    const rateVariant = await this.findOne(id);

    Object.assign(rateVariant, updateDto);
    rateVariant.updatedBy = updatedBy;

    return await this.rateVariantRepository.save(rateVariant);
  }

  async remove(id: number): Promise<void> {
    const rateVariant = await this.findOne(id);
    await this.rateVariantRepository.remove(rateVariant);
  }
}


