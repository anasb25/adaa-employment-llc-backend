import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSkill } from './entities/project-skill.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import { ProjectSkillRate } from './entities/project-skill-rate.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import { SkillRate } from '../skills/entities/skill-rate.entity';
import {
  CreateProjectSkillRateDto,
  BulkCreateProjectSkillRatesDto,
} from './dto/create-project-skill-rate.dto';

@Injectable()
export class ProjectSkillsService {
  constructor(
    @InjectRepository(ProjectSkill)
    private readonly projectSkillRepository: Repository<ProjectSkill>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(ProjectSkillRate)
    private readonly projectSkillRateRepository: Repository<ProjectSkillRate>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
    @InjectRepository(SkillRate)
    private readonly skillRateRepository: Repository<SkillRate>,
  ) {}

  async assignSkillToProject(
    projectId: number,
    skillId: number,
    sale_price?: number,
  ): Promise<ProjectSkill> {
    // Check if assignment already exists
    const existing = await this.projectSkillRepository.findOne({
      where: { projectId, skillId },
    });

    if (existing) {
      // Update existing assignment
      if (sale_price !== undefined) {
        existing.sale_price = sale_price;
      }
      return await this.projectSkillRepository.save(existing);
    }

    // Create new assignment
    const projectSkill = this.projectSkillRepository.create({
      projectId,
      skillId,
      sale_price,
    });

    const saved = await this.projectSkillRepository.save(projectSkill);

    // Auto-populate rates from skill rates (client rates)
    await this.autoPopulateProjectSkillRates(projectId, skillId);

    return saved;
  }

  private async autoPopulateProjectSkillRates(
    projectId: number,
    skillId: number,
  ): Promise<void> {
    // Get all rate variants for this skill
    const skillRates = await this.skillRateRepository.find({
      where: { skillId },
      relations: ['rateVariant'],
    });

    // Create project skill rates based on skill rates (using clientRateValue)
    for (const skillRate of skillRates) {
      await this.projectSkillRateRepository.save({
        projectId,
        skillId,
        rateVariantId: skillRate.rateVariantId,
        rateType: skillRate.rateType,
        rateValue: skillRate.clientRateValue,
        notes: skillRate.notes,
      });
    }
  }

  async removeSkillFromProject(
    projectId: number,
    skillId: number,
  ): Promise<void> {
    await this.projectSkillRepository.delete({ projectId, skillId });
  }

  async updateSalePrice(
    projectId: number,
    skillId: number,
    sale_price: number,
  ): Promise<ProjectSkill> {
    const projectSkill = await this.projectSkillRepository.findOne({
      where: { projectId, skillId },
    });

    if (!projectSkill) {
      throw new Error('Project skill assignment not found');
    }

    projectSkill.sale_price = sale_price;
    return await this.projectSkillRepository.save(projectSkill);
  }

  async getProjectSkills(projectId: number): Promise<ProjectSkill[]> {
    return await this.projectSkillRepository.find({
      where: { projectId },
      relations: ['skill', 'skill.skillType'],
      order: { createdAt: 'DESC' },
    });
  }

  // ============= PROJECT SKILL RATES =============

  async createProjectSkillRate(
    dto: CreateProjectSkillRateDto,
    createdBy: number,
  ): Promise<ProjectSkillRate> {
    // Verify project skill exists
    const projectSkill = await this.projectSkillRepository.findOne({
      where: { projectId: dto.projectId, skillId: dto.skillId },
    });

    if (!projectSkill) {
      throw new NotFoundException('Project skill assignment not found');
    }

    // Check if rate already exists
    const existing = await this.projectSkillRateRepository.findOne({
      where: {
        projectId: dto.projectId,
        skillId: dto.skillId,
        rateVariantId: dto.rateVariantId,
      },
    });

    if (existing) {
      // Update existing rate
      Object.assign(existing, dto);
      existing.updatedBy = createdBy;
      return await this.projectSkillRateRepository.save(existing);
    }

    // Create new rate
    const rate = this.projectSkillRateRepository.create({
      ...dto,
      createdBy,
    });

    return await this.projectSkillRateRepository.save(rate);
  }

  async bulkCreateProjectSkillRates(
    dto: BulkCreateProjectSkillRatesDto,
    createdBy: number,
  ): Promise<ProjectSkillRate[]> {
    const rates: ProjectSkillRate[] = [];

    for (const rateData of dto.rates) {
      const rate = await this.createProjectSkillRate(
        {
          projectId: dto.projectId,
          skillId: dto.skillId,
          ...rateData,
        },
        createdBy,
      );
      rates.push(rate);
    }

    return rates;
  }

  async getProjectSkillRates(
    projectId: number,
    skillId: number,
  ): Promise<ProjectSkillRate[]> {
    return await this.projectSkillRateRepository.find({
      where: { projectId, skillId },
      relations: ['rateVariant'],
      order: { rateVariant: { displayOrder: 'ASC' } },
    });
  }

  async getProjectSkillRatesForProject(
    projectId: number,
  ): Promise<
    Array<{ skillId: number; skillName: string; rates: ProjectSkillRate[] }>
  > {
    const projectSkills = await this.projectSkillRepository.find({
      where: { projectId },
      relations: ['skill'],
    });

    const result: Array<{
      skillId: number;
      skillName: string;
      rates: ProjectSkillRate[];
    }> = [];
    
    for (const ps of projectSkills) {
      const rates = await this.getProjectSkillRates(projectId, ps.skillId);
      result.push({
        skillId: ps.skillId,
        skillName: ps.skill?.skill || 'Unknown',
        rates,
      });
    }

    return result;
  }

  async deleteProjectSkillRate(
    projectId: number,
    skillId: number,
    rateVariantId: number,
  ): Promise<void> {
    await this.projectSkillRateRepository.delete({
      projectId,
      skillId,
      rateVariantId,
    });
  }

  async getApplicableRate(
    projectId: number,
    skillId: number,
    rateVariantId: number,
  ): Promise<{ finalRate: number; rateDetails: ProjectSkillRate }> {
    const rate = await this.projectSkillRateRepository.findOne({
      where: { projectId, skillId, rateVariantId },
      relations: ['rateVariant'],
    });

    if (!rate) {
      throw new NotFoundException(
        'Rate not configured for this project-skill-variant combination',
      );
    }

    let finalRate = rate.rateValue;

    // If it's a multiplier, calculate based on base rate
    if (rate.rateType === 'multiplier') {
      const baseRate = await this.projectSkillRateRepository.findOne({
        where: { projectId, skillId },
        relations: ['rateVariant'],
      });

      if (baseRate && baseRate.rateVariant.isBaseRate) {
        finalRate = baseRate.rateValue * rate.rateValue;
      } else {
        throw new NotFoundException(
          'Base rate not found for multiplier calculation',
        );
      }
    }

    return { finalRate, rateDetails: rate };
  }
}
