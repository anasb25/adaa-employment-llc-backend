import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateVariant } from './entities/rate-variant.entity';
import { CreateRateVariantDto } from './dto/create-rate-variant.dto';
import { UpdateRateVariantDto } from './dto/update-rate-variant.dto';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';

export interface RateVariantRates {
  rateVariant: RateVariant;
  clientRateMultiplier: number;
  employeeAdditionalAmount: number;
}

@Injectable()
export class RateVariantsService {
  constructor(
    @InjectRepository(RateVariant)
    private rateVariantRepository: Repository<RateVariant>,
    @InjectRepository(ProjectRateVariantRate)
    private projectRateVariantRateRepository: Repository<ProjectRateVariantRate>,
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

    // For system variants, only allow updating rate fields
    if (rateVariant.isSystem) {
      const allowedFields = ['employeeAdditionalAmount', 'clientRateMultiplier'];
      const disallowedChanges: string[] = [];

      for (const [key, value] of Object.entries(updateDto)) {
        if (value !== undefined && !allowedFields.includes(key)) {
          if (rateVariant[key] !== value) {
            disallowedChanges.push(key);
          }
        }
      }

      if (disallowedChanges.length > 0) {
        throw new BadRequestException(
          `System variants can only have their rates updated. Cannot modify: ${disallowedChanges.join(', ')}`,
        );
      }

      if (updateDto.employeeAdditionalAmount !== undefined) {
        rateVariant.employeeAdditionalAmount = updateDto.employeeAdditionalAmount;
      }
      if (updateDto.clientRateMultiplier !== undefined) {
        rateVariant.clientRateMultiplier = updateDto.clientRateMultiplier;
      }
    } else {
      // For non-system variants, update all provided fields
      Object.assign(rateVariant, updateDto);
    }

    rateVariant.updatedBy = updatedBy;

    return await this.rateVariantRepository.save(rateVariant);
  }

  async remove(id: number): Promise<void> {
    const rateVariant = await this.findOne(id);
    
    if (rateVariant.isSystem) {
      throw new BadRequestException(
        'System variants cannot be deleted',
      );
    }
    
    await this.rateVariantRepository.remove(rateVariant);
  }

  /**
   * Get rate variant rates for a specific variant
   * This is the main utility method to be used by other modules (timesheets, billing)
   *
   * @param rateVariantId - The rate variant ID
   * @param projectId - Optional project ID. If provided, uses project-specific client rate multiplier if available, otherwise falls back to global rate.
   *                    Employee rates always come from the global rate variant.
   */
  async getRateVariantRates(
    rateVariantId: number,
    projectId?: number,
  ): Promise<RateVariantRates> {
    const rateVariant = await this.findOne(rateVariantId);

    // Get client rate multiplier - project-specific takes precedence, then global, then 1.0
    let clientRateMultiplier =
      Number(rateVariant.clientRateMultiplier) || 1.0; // Start with global default
    if (projectId) {
      const projectRate =
        await this.projectRateVariantRateRepository.findOne({
          where: {
            projectId,
            rateVariantId: rateVariant.id,
          },
        });
      if (projectRate) {
        clientRateMultiplier = Number(projectRate.clientRateMultiplier);
      }
    }

    const employeeAdditionalAmount = Number(rateVariant.employeeAdditionalAmount || 0);

    return {
      rateVariant,
      clientRateMultiplier,
      employeeAdditionalAmount,
    };
  }
}


