import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Project } from './entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import {
  PaginationOptions,
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Project>> {
    return await PaginationUtil.paginate(this.projectRepository, options, {
      relations: [
        'client',
        'projectSkills',
        'projectSkills.skill',
        'projectSkills.skill.skillType',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Project[]> {
    return await this.projectRepository.find({
      relations: [
        'client',
        'projectSkills',
        'projectSkills.skill',
        'projectSkills.skill.skillType',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async search(
    query: string,
    options: PaginationOptions,
  ): Promise<PaginatedResponse<Project>> {
    const searchTerm = `%${query}%`;
    return await PaginationUtil.paginate(this.projectRepository, options, {
      relations: [
        'client',
        'projectSkills',
        'projectSkills.skill',
        'projectSkills.skill.skillType',
      ],
      where: [{ name: ILike(searchTerm) }, { location: ILike(searchTerm) }],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Project | null> {
    return await this.projectRepository.findOne({
      where: { id },
      relations: [
        'client',
        'projectSkills',
        'projectSkills.skill',
        'projectSkills.skill.skillType',
      ],
    });
  }

  async create(data: Partial<Project>): Promise<Project> {
    if (data.clientId) {
      await this.clientRepository.findOneOrFail({
        where: { id: data.clientId },
      });
    }
    const entity = this.projectRepository.create(data);
    return await this.projectRepository.save(entity);
  }

  async update(id: number, data: Partial<Project>): Promise<Project> {
    if (data.clientId) {
      await this.clientRepository.findOneOrFail({
        where: { id: data.clientId },
      });
    }
    await this.projectRepository.update(id, data);
    return (await this.findOne(id)) as Project;
  }

  async remove(id: number): Promise<void> {
    await this.projectRepository.softDelete(id);
  }
}
