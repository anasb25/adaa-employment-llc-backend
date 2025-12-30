import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Skill } from './entities/skill.entity';
import { SkillType } from './entities/skill-type.entity';
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
}
