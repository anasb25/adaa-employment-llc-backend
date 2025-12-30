import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { EmployeeSkillRate } from './entities/employee-skill-rate.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillRate } from '../skills/entities/skill-rate.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';

@Injectable()
export class EmployeeSkillsService {
  constructor(
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    @InjectRepository(EmployeeSkillRate)
    private readonly employeeSkillRateRepository: Repository<EmployeeSkillRate>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(SkillRate)
    private readonly skillRateRepository: Repository<SkillRate>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
  ) {}

  async assignSkillToEmployee(
    employeeId: number,
    skillId: number,
    rating: number,
    cost_price?: number,
  ): Promise<EmployeeSkill> {
    // Check if assignment already exists
    const existing = await this.employeeSkillRepository.findOne({
      where: { employeeId, skillId },
    });

    if (existing) {
      // Update existing assignment
      existing.rating = rating;
      if (cost_price !== undefined) {
        existing.cost_price = cost_price;
      }
      const saved = await this.employeeSkillRepository.save(existing);
      // Reload with relations
      return (
        (await this.employeeSkillRepository.findOne({
          where: { id: saved.id },
          relations: ['skill', 'skill.skillType'],
        })) || saved
      );
    }

    // Create new assignment
    const employeeSkill = this.employeeSkillRepository.create({
      employeeId,
      skillId,
      rating,
      cost_price,
    });

    const saved = await this.employeeSkillRepository.save(employeeSkill);

    // Auto-populate rates from skill rates
    await this.autoPopulateEmployeeSkillRates(saved.id, skillId);

    // Reload with relations
    return (
      (await this.employeeSkillRepository.findOne({
        where: { id: saved.id },
        relations: ['skill', 'skill.skillType'],
      })) || saved
    );
  }

  private async autoPopulateEmployeeSkillRates(
    employeeSkillId: number,
    skillId: number,
  ): Promise<void> {
    // Get all rate variants for this skill
    const skillRates = await this.skillRateRepository.find({
      where: { skillId },
      relations: ['rateVariant'],
    });

    // Create employee skill rates based on skill rates
    for (const skillRate of skillRates) {
      await this.employeeSkillRateRepository.save({
        employeeSkillId,
        rateVariantId: skillRate.rateVariantId,
        rateType: skillRate.rateType,
        rateValue: skillRate.employeeRateValue,
        notes: skillRate.notes,
      });
    }
  }

  async removeSkillFromEmployee(
    employeeId: number,
    skillId: number,
  ): Promise<void> {
    await this.employeeSkillRepository.delete({ employeeId, skillId });
  }

  async updateRating(
    employeeId: number,
    skillId: number,
    rating: number,
  ): Promise<EmployeeSkill> {
    const employeeSkill = await this.employeeSkillRepository.findOne({
      where: { employeeId, skillId },
    });

    if (!employeeSkill) {
      throw new Error('Employee skill assignment not found');
    }

    employeeSkill.rating = rating;
    return await this.employeeSkillRepository.save(employeeSkill);
  }

  async getEmployeeSkills(employeeId: number): Promise<EmployeeSkill[]> {
    return await this.employeeSkillRepository.find({
      where: { employeeId },
      relations: ['skill', 'skill.skillType'],
      order: { createdAt: 'DESC' },
    });
  }

  // ============= EMPLOYEE SKILL RATES =============

  async getEmployeeSkillRates(employeeSkillId: number): Promise<EmployeeSkillRate[]> {
    return await this.employeeSkillRateRepository.find({
      where: { employeeSkillId },
      relations: ['rateVariant'],
      order: { rateVariant: { displayOrder: 'ASC' } },
    });
  }

  async updateEmployeeSkillRate(
    employeeSkillId: number,
    rateVariantId: number,
    rateValue: number,
    rateType: string,
    notes?: string,
  ): Promise<EmployeeSkillRate> {
    const existing = await this.employeeSkillRateRepository.findOne({
      where: { employeeSkillId, rateVariantId },
    });

    if (existing) {
      existing.rateValue = rateValue;
      existing.rateType = rateType as any;
      if (notes !== undefined) {
        existing.notes = notes;
      }
      return await this.employeeSkillRateRepository.save(existing);
    }

    return await this.employeeSkillRateRepository.save({
      employeeSkillId,
      rateVariantId,
      rateValue,
      rateType: rateType as any,
      notes,
    });
  }

  async bulkUpdateEmployeeSkillRates(
    employeeSkillId: number,
    rates: Array<{
      rateVariantId: number;
      rateValue: number;
      rateType: string;
      notes?: string;
    }>,
  ): Promise<EmployeeSkillRate[]> {
    const results: EmployeeSkillRate[] = [];
    for (const rate of rates) {
      const result = await this.updateEmployeeSkillRate(
        employeeSkillId,
        rate.rateVariantId,
        rate.rateValue,
        rate.rateType,
        rate.notes,
      );
      results.push(result);
    }
    return results;
  }
}
