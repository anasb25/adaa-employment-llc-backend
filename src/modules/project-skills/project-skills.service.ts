import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSkill } from './entities/project-skill.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';

@Injectable()
export class ProjectSkillsService {
  constructor(
    @InjectRepository(ProjectSkill)
    private readonly projectSkillRepository: Repository<ProjectSkill>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
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
    return saved;
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
}
