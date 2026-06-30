import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Project } from './entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import { ProjectSpecialDayRate } from './entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from './entities/project-rate-variant-rate.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import {
  PaginationOptions,
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';
import {
  CreateProjectDto,
  ProjectSpecialDayRateDto,
  ProjectRateVariantRateDto,
} from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ProjectSpecialDayRate)
    private readonly projectSpecialDayRateRepository: Repository<ProjectSpecialDayRate>,
    @InjectRepository(ProjectRateVariantRate)
    private readonly projectRateVariantRateRepository: Repository<ProjectRateVariantRate>,
    @InjectRepository(SpecialDay)
    private readonly specialDayRepository: Repository<SpecialDay>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
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
        'specialDayRates',
        'specialDayRates.specialDay',
        'rateVariantRates',
        'rateVariantRates.rateVariant',
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
        'specialDayRates',
        'specialDayRates.specialDay',
        'rateVariantRates',
        'rateVariantRates.rateVariant',
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
        'specialDayRates',
        'specialDayRates.specialDay',
        'rateVariantRates',
        'rateVariantRates.rateVariant',
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
        'specialDayRates',
        'specialDayRates.specialDay',
        'rateVariantRates',
        'rateVariantRates.rateVariant',
      ],
    });
  }

  async create(
    data: CreateProjectDto & { createdBy?: number },
  ): Promise<Project> {
    if (data.clientId) {
      await this.clientRepository.findOneOrFail({
        where: { id: data.clientId },
      });
    }

    // Extract special day rates and rate variant rates from data
    const { specialDayRates, rateVariantRates, ...projectData } = data;

    // Create project
    const entity = this.projectRepository.create(projectData);
    const project = await this.projectRepository.save(entity);

    // Handle special day rates if provided
    if (specialDayRates && specialDayRates.length > 0) {
      await this.saveSpecialDayRates(project.id, specialDayRates);
    }

    // Handle rate variant rates if provided
    if (rateVariantRates && rateVariantRates.length > 0) {
      await this.saveRateVariantRates(project.id, rateVariantRates);
    }

    return await this.findOne(project.id) as Project;
  }

  async update(
    id: number,
    data: Partial<CreateProjectDto> & { updatedBy?: number },
  ): Promise<Project> {
    if (data.clientId) {
      await this.clientRepository.findOneOrFail({
        where: { id: data.clientId },
      });
    }

    // Extract special day rates and rate variant rates from data
    const { specialDayRates, rateVariantRates, ...projectData } = data;

    // Update project
    await this.projectRepository.update(id, projectData);

    // Handle special day rates if provided
    if (specialDayRates !== undefined) {
      // Delete existing rates
      await this.projectSpecialDayRateRepository.delete({ projectId: id });
      // Save new rates
      if (specialDayRates.length > 0) {
        await this.saveSpecialDayRates(id, specialDayRates);
      }
    }

    // Handle rate variant rates if provided
    if (rateVariantRates !== undefined) {
      // Delete existing rates
      await this.projectRateVariantRateRepository.delete({ projectId: id });
      // Save new rates
      if (rateVariantRates.length > 0) {
        await this.saveRateVariantRates(id, rateVariantRates);
      }
    }

    return (await this.findOne(id)) as Project;
  }

  private async saveSpecialDayRates(
    projectId: number,
    rates: ProjectSpecialDayRateDto[],
  ): Promise<void> {
    // Validate all special days exist
    const specialDayIds = rates.map((r) => r.specialDayId);
    const existingSpecialDays = await this.specialDayRepository.find({
      where: { id: In(specialDayIds) },
    });

    if (existingSpecialDays.length !== specialDayIds.length) {
      const foundIds = existingSpecialDays.map((sd) => sd.id);
      const missingIds = specialDayIds.filter((id) => !foundIds.includes(id));
      throw new Error(
        `Special days with IDs ${missingIds.join(', ')} not found`,
      );
    }

    // Create rate entities. When a row is present but `isEnabled` is not set,
    // default to `true` to match the entity-level default.
    const rateEntities = rates.map((rate) =>
      this.projectSpecialDayRateRepository.create({
        projectId,
        specialDayId: rate.specialDayId,
        clientRateMultiplier: rate.clientRateMultiplier,
        isEnabled: rate.isEnabled ?? true,
      }),
    );

    await this.projectSpecialDayRateRepository.save(rateEntities);
  }

  private async saveRateVariantRates(
    projectId: number,
    rates: ProjectRateVariantRateDto[],
  ): Promise<void> {
    // Validate all rate variants exist
    const rateVariantIds = rates.map((r) => r.rateVariantId);
    const existingRateVariants = await this.rateVariantRepository.find({
      where: { id: In(rateVariantIds) },
    });

    if (existingRateVariants.length !== rateVariantIds.length) {
      const foundIds = existingRateVariants.map((rv) => rv.id);
      const missingIds = rateVariantIds.filter((id) => !foundIds.includes(id));
      throw new Error(
        `Rate variants with IDs ${missingIds.join(', ')} not found`,
      );
    }

    const rateEntities = rates.map((rate) =>
      this.projectRateVariantRateRepository.create({
        projectId,
        rateVariantId: rate.rateVariantId,
        clientRateMultiplier: rate.clientRateMultiplier,
        isEnabled: rate.isEnabled ?? true,
      }),
    );

    await this.projectRateVariantRateRepository.save(rateEntities);
  }

  async remove(id: number): Promise<void> {
    // Hard delete so DB CASCADE runs: mobilizations, timesheets (+ entries),
    // project_skills, project_special_day_rates, project_rate_variant_rates, invoices.
    // Employees and client are not affected.
    await this.projectRepository.delete(id);
  }

  async removeMany(ids: number[]): Promise<{ deleted: number }> {
    const result = await this.projectRepository.delete(ids);
    return { deleted: result.affected || 0 };
  }
}
