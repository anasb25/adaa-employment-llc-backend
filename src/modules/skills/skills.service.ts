import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Skill } from './entities/skill.entity';
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
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Skill>> {
    return await PaginationUtil.paginate(this.skillRepository, options, {
      relations: ['employeeSkills'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Skill[]> {
    return await this.skillRepository.find({
      relations: ['employeeSkills'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchSkills(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Skill>> {
    const searchTerm = `%${query}%`;

    return await PaginationUtil.paginate(this.skillRepository, options, {
      relations: ['employeeSkills'],
      where: [
        { type: ILike(searchTerm) },
        { skill: ILike(searchTerm) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Skill | null> {
    return await this.skillRepository.findOne({
      where: { id },
      relations: ['employeeSkills'],
    });
  }

  async create(skillData: Partial<Skill>): Promise<Skill> {
    const skill = this.skillRepository.create(skillData);
    return await this.skillRepository.save(skill);
  }

  async update(id: number, skillData: Partial<Skill>): Promise<Skill> {
    await this.skillRepository.update(id, skillData);
    return (await this.findOne(id)) as Skill;
  }

  async remove(id: number): Promise<void> {
    await this.skillRepository.softDelete(id);
  }
}

