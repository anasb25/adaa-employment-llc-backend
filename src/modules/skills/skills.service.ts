import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Skill } from './entities/skill.entity';
import { SkillType } from './entities/skill-type.entity';
import { SkillRate } from './entities/skill-rate.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import {
  PaginationUtil,
  PaginationOptions,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(SkillType)
    private readonly skillTypeRepository: Repository<SkillType>,
    @InjectRepository(SkillRate)
    private readonly skillRateRepository: Repository<SkillRate>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Skill>> {
    return await PaginationUtil.paginate(this.skillRepository, options, {
      relations: ['employeeSkills', 'skillType'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Skill[]> {
    return await this.skillRepository.find({
      relations: ['employeeSkills', 'skillType'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchSkills(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Skill>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.skillRepository, options, {
      relations: ['employeeSkills', 'skillType'],
      where: [
        { skill: ILike(searchTerm) },
        { skillType: { type: ILike(searchTerm) } as any },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Skill | null> {
    return await this.skillRepository.findOne({
      where: { id },
      relations: ['employeeSkills', 'skillType'],
    });
  }

  async create(skillData: Partial<Skill>): Promise<Skill> {
    if (skillData.skillTypeId) {
      await this.skillTypeRepository.findOneOrFail({
        where: { id: skillData.skillTypeId },
      });
    }
    const skill = this.skillRepository.create(skillData);
    return await this.skillRepository.save(skill);
  }

  async update(id: number, skillData: Partial<Skill>): Promise<Skill> {
    if (skillData.skillTypeId) {
      await this.skillTypeRepository.findOneOrFail({
        where: { id: skillData.skillTypeId },
      });
    }
    await this.skillRepository.update(id, skillData);
    return (await this.findOne(id)) as Skill;
  }

  async remove(id: number): Promise<void> {
    await this.skillRepository.softDelete(id);
  }

  // Skill Types
  async getSkillTypes(): Promise<SkillType[]> {
    return await this.skillTypeRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createSkillType(data: Partial<SkillType>): Promise<SkillType> {
    const skillType = this.skillTypeRepository.create(data);
    return await this.skillTypeRepository.save(skillType);
  }

  async updateSkillType(
    id: number,
    data: Partial<SkillType>,
  ): Promise<SkillType> {
    await this.skillTypeRepository.update(id, data);
    return (await this.skillTypeRepository.findOne({
      where: { id },
    })) as SkillType;
  }

  async removeSkillType(id: number): Promise<void> {
    await this.skillTypeRepository.softDelete(id);
  }

  // ============= SKILL RATES =============

  async createSkillRate(
    skillId: number,
    rateVariantId: number,
    employeeRateValue: number,
    clientRateValue: number,
    rateType: string,
    notes?: string,
    createdBy?: number,
  ): Promise<SkillRate> {
    // Check if rate already exists
    const existing = await this.skillRateRepository.findOne({
      where: { skillId, rateVariantId },
    });

    if (existing) {
      // Update existing rate
      existing.employeeRateValue = employeeRateValue;
      existing.clientRateValue = clientRateValue;
      existing.rateType = rateType as any;
      if (notes !== undefined) {
        existing.notes = notes;
      }
      if (createdBy) existing.updatedBy = createdBy;
      return await this.skillRateRepository.save(existing);
    }

    // Create new rate
    const rate = this.skillRateRepository.create({
      skillId,
      rateVariantId,
      employeeRateValue,
      clientRateValue,
      rateType: rateType as any,
      notes,
      createdBy,
    });

    return await this.skillRateRepository.save(rate);
  }

  async bulkCreateSkillRates(
    skillId: number,
    rates: Array<{
      rateVariantId: number;
      employeeRateValue: number;
      clientRateValue: number;
      rateType: string;
      notes?: string;
    }>,
    createdBy?: number,
  ): Promise<SkillRate[]> {
    const skillRates: SkillRate[] = [];

    for (const rateData of rates) {
      const rate = await this.createSkillRate(
        skillId,
        rateData.rateVariantId,
        rateData.employeeRateValue,
        rateData.clientRateValue,
        rateData.rateType,
        rateData.notes,
        createdBy,
      );
      skillRates.push(rate);
    }

    return skillRates;
  }

  async getSkillRates(skillId: number): Promise<SkillRate[]> {
    return await this.skillRateRepository.find({
      where: { skillId },
      relations: ['rateVariant'],
      order: { rateVariant: { displayOrder: 'ASC' } },
    });
  }

  async deleteSkillRate(skillId: number, rateVariantId: number): Promise<void> {
    await this.skillRateRepository.delete({ skillId, rateVariantId });
  }

  async getCalculatedRate(
    skillId: number,
    rateVariantId: number,
  ): Promise<{
    finalEmployeeRate: number;
    finalClientRate: number;
    rateDetails: SkillRate;
  }> {
    const rate = await this.skillRateRepository.findOne({
      where: { skillId, rateVariantId },
      relations: ['rateVariant'],
    });

    if (!rate) {
      throw new NotFoundException(
        'Rate not configured for this skill-variant combination',
      );
    }

    let finalEmployeeRate = rate.employeeRateValue;
    let finalClientRate = rate.clientRateValue;

    // If it's a multiplier, calculate based on base rate
    if (rate.rateType === 'multiplier') {
      const baseRate = await this.skillRateRepository.findOne({
        where: { skillId },
        relations: ['rateVariant'],
      });

      if (baseRate && baseRate.rateVariant.isBaseRate) {
        finalEmployeeRate = baseRate.employeeRateValue * rate.employeeRateValue;
        finalClientRate = baseRate.clientRateValue * rate.clientRateValue;
      } else {
        throw new NotFoundException(
          'Base rate not found for multiplier calculation',
        );
      }
    }

    return { finalEmployeeRate, finalClientRate, rateDetails: rate };
  }
}
