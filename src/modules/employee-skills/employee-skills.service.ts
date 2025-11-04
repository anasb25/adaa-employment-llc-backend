import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';

@Injectable()
export class EmployeeSkillsService {
  constructor(
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  async assignSkillToEmployee(
    employeeId: number,
    skillId: number,
    rating: number,
  ): Promise<EmployeeSkill> {
    // Check if assignment already exists
    const existing = await this.employeeSkillRepository.findOne({
      where: { employeeId, skillId },
    });

    if (existing) {
      // Update existing assignment
      existing.rating = rating;
      return await this.employeeSkillRepository.save(existing);
    }

    // Create new assignment
    const employeeSkill = this.employeeSkillRepository.create({
      employeeId,
      skillId,
      rating,
    });

    return await this.employeeSkillRepository.save(employeeSkill);
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
      relations: ['skill'],
      order: { createdAt: 'DESC' },
    });
  }
}

