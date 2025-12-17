import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Mobilization,
  MobilizationStatus,
  MobStatus,
} from './entities/mobilization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import {
  CreateMobilizationDto,
  BulkCreateMobilizationDto,
} from './dto/create-mobilization.dto';
import { UpdateMobilizationDto } from './dto/update-mobilization.dto';
import { MobilizationFiltersDto } from './dto/mobilization-filters.dto';
import {
  PaginationOptions,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Injectable()
export class MobilizationsService {
  private readonly logger = new Logger(MobilizationsService.name);

  constructor(
    @InjectRepository(Mobilization)
    private mobilizationRepository: Repository<Mobilization>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  /**
   * Create a single mobilization record
   */
  async create(
    createDto: CreateMobilizationDto,
    createdBy: number,
  ): Promise<Mobilization> {
    // Validate employee exists
    const employee = await this.employeeRepository.findOne({
      where: { id: createDto.employeeId },
    });
    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    // Validate project exists (if provided)
    if (createDto.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: createDto.projectId },
      });
      if (!project) {
        throw new BadRequestException('Project not found');
      }
    }

    // Validate skill exists
    const skill = await this.skillRepository.findOne({
      where: { id: createDto.mobilizedTradeId },
    });
    if (!skill) {
      throw new BadRequestException('Skill/Trade not found');
    }

    // Check if employee already has an active mobilization
    const existingActive = await this.mobilizationRepository.findOne({
      where: {
        employeeId: createDto.employeeId,
        status: MobilizationStatus.ACTIVE,
      },
      order: { actionDate: 'DESC' },
    });

    if (existingActive) {
      this.logger.warn(
        `Employee ${createDto.employeeId} already has an active mobilization. Creating new record anyway.`,
      );
    }

    const mobilization = this.mobilizationRepository.create({
      ...createDto,
      createdBy,
    });

    const saved = await this.mobilizationRepository.save(mobilization);

    // Return with relations
    const result = await this.findOne(saved.id);
    if (!result) {
      throw new NotFoundException('Failed to retrieve created mobilization');
    }
    return result;
  }

  /**
   * Create mobilizations for multiple employees
   */
  async createBulk(
    createDto: BulkCreateMobilizationDto,
    createdBy: number,
  ): Promise<Mobilization[]> {
    // Validate all employees exist
    const employees = await this.employeeRepository.findByIds(
      createDto.employeeIds,
    );
    if (employees.length !== createDto.employeeIds.length) {
      throw new BadRequestException('One or more employees not found');
    }

    // Validate project exists (if provided)
    if (createDto.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: createDto.projectId },
      });
      if (!project) {
        throw new BadRequestException('Project not found');
      }
    }

    // Validate skill exists
    const skill = await this.skillRepository.findOne({
      where: { id: createDto.mobilizedTradeId },
    });
    if (!skill) {
      throw new BadRequestException('Skill/Trade not found');
    }

    // Create mobilizations for all employees
    const mobilizations = createDto.employeeIds.map((employeeId) => ({
      employeeId,
      mobilizedTradeId: createDto.mobilizedTradeId,
      projectId: createDto.projectId,
      status: createDto.status || MobilizationStatus.ACTIVE,
      mobStatus: createDto.mobStatus,
      jobStatus: createDto.jobStatus,
      actionDate: createDto.actionDate,
      notes: createDto.notes,
      createdBy,
    }));

    const entities = this.mobilizationRepository.create(mobilizations);

    const saved = await this.mobilizationRepository.save(entities);

    this.logger.log(
      `Created ${saved.length} mobilization records for ${createDto.employeeIds.length} employees`,
    );

    // Return with relations
    return await this.mobilizationRepository.find({
      where: { id: saved.map((m) => m.id) as any },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
    });
  }

  /**
   * Get all mobilizations with pagination and filters
   */
  async findAll(
    options: PaginationOptions,
    filters?: MobilizationFiltersDto,
  ): Promise<any> {
    const queryBuilder = this.mobilizationRepository
      .createQueryBuilder('mobilization')
      .leftJoinAndSelect('mobilization.employee', 'employee')
      .leftJoinAndSelect('mobilization.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('mobilization.mobilizedTrade', 'mobilizedTrade')
      .orderBy('mobilization.actionDate', 'DESC')
      .addOrderBy('mobilization.createdAt', 'DESC');

    this.applyFilters(queryBuilder, filters);

    const [data, total] = await queryBuilder
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();

    return PaginationUtil.createPaginatedResponse(
      data,
      total,
      options.page,
      options.limit,
    );
  }

  /**
   * Apply filters to query builder
   */
  private applyFilters(
    queryBuilder: any,
    filters?: MobilizationFiltersDto,
  ): void {
    if (!filters) return;

    if (filters.employeeId) {
      queryBuilder.andWhere('mobilization.employeeId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (filters.projectId) {
      queryBuilder.andWhere('mobilization.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }

    if (filters.mobilizedTradeId) {
      queryBuilder.andWhere(
        'mobilization.mobilizedTradeId = :mobilizedTradeId',
        {
          mobilizedTradeId: filters.mobilizedTradeId,
        },
      );
    }

    if (filters.status) {
      queryBuilder.andWhere('mobilization.status = :status', {
        status: filters.status,
      });
    }

    if (filters.mobStatus) {
      queryBuilder.andWhere('mobilization.mobStatus = :mobStatus', {
        mobStatus: filters.mobStatus,
      });
    }

    if (filters.jobStatus) {
      queryBuilder.andWhere('mobilization.jobStatus = :jobStatus', {
        jobStatus: filters.jobStatus,
      });
    }

    if (filters.actionDate) {
      queryBuilder.andWhere('mobilization.actionDate = :actionDate', {
        actionDate: filters.actionDate,
      });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere(
        'mobilization.actionDate BETWEEN :startDate AND :endDate',
        {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
      );
    } else if (filters.startDate) {
      queryBuilder.andWhere('mobilization.actionDate >= :startDate', {
        startDate: filters.startDate,
      });
    } else if (filters.endDate) {
      queryBuilder.andWhere('mobilization.actionDate <= :endDate', {
        endDate: filters.endDate,
      });
    }
  }

  /**
   * Find one mobilization by ID
   */
  async findOne(id: number): Promise<Mobilization | null> {
    return await this.mobilizationRepository.findOne({
      where: { id },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
    });
  }

  /**
   * Get latest active mobilization for an employee
   */
  async getLatestForEmployee(employeeId: number): Promise<Mobilization | null> {
    return await this.mobilizationRepository.findOne({
      where: {
        employeeId,
        status: MobilizationStatus.ACTIVE,
      },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Get all employees currently mobilized to a project
   */
  async getEmployeesOnProject(projectId: number): Promise<Mobilization[]> {
    return await this.mobilizationRepository.find({
      where: {
        projectId,
        status: MobilizationStatus.ACTIVE,
        mobStatus: MobStatus.MOBILIZED,
      },
      relations: ['employee', 'mobilizedTrade'],
      order: { actionDate: 'DESC' },
    });
  }

  /**
   * Update mobilization
   */
  async update(
    id: number,
    updateDto: UpdateMobilizationDto,
    updatedBy: number,
  ): Promise<Mobilization> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Mobilization not found');
    }

    // Validate project if being updated
    if (updateDto.projectId) {
      const project = await this.projectRepository.findOne({
        where: { id: updateDto.projectId },
      });
      if (!project) {
        throw new BadRequestException('Project not found');
      }
    }

    // Validate skill if being updated
    if (updateDto.mobilizedTradeId) {
      const skill = await this.skillRepository.findOne({
        where: { id: updateDto.mobilizedTradeId },
      });
      if (!skill) {
        throw new BadRequestException('Skill/Trade not found');
      }
    }

    await this.mobilizationRepository.update(id, {
      ...updateDto,
      updatedBy,
    });

    const result = await this.findOne(id);
    if (!result) {
      throw new NotFoundException('Failed to retrieve updated mobilization');
    }
    return result;
  }

  /**
   * Soft delete mobilization
   */
  async remove(id: number, deletedBy: number): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Mobilization not found');
    }

    await this.mobilizationRepository.update(id, { deletedBy });
    await this.mobilizationRepository.softDelete(id);
  }

  /**
   * Get mobilization statistics
   */
  async getStatistics(projectId?: number): Promise<any> {
    const queryBuilder = this.mobilizationRepository
      .createQueryBuilder('mobilization')
      .leftJoinAndSelect('mobilization.employee', 'employee')
      .leftJoinAndSelect('mobilization.project', 'project')
      .leftJoinAndSelect('mobilization.mobilizedTrade', 'mobilizedTrade')
      .where('mobilization.status = :status', {
        status: MobilizationStatus.ACTIVE,
      });

    if (projectId) {
      queryBuilder.andWhere('mobilization.projectId = :projectId', {
        projectId,
      });
    }

    const mobilizations = await queryBuilder.getMany();

    // Count by mob status
    const byMobStatus = {
      mobilized: mobilizations.filter((m) => m.mobStatus === 'mobilized')
        .length,
      demobilized: mobilizations.filter((m) => m.mobStatus === 'demobilized')
        .length,
    };

    // Count by job status
    const byJobStatus = {
      on_job: mobilizations.filter((m) => m.jobStatus === 'on_job').length,
      cancelled: mobilizations.filter((m) => m.jobStatus === 'cancelled')
        .length,
      on_vacation: mobilizations.filter((m) => m.jobStatus === 'on_vacation')
        .length,
      absconded: mobilizations.filter((m) => m.jobStatus === 'absconded')
        .length,
    };

    // Count by project
    const byProject = new Map<string, number>();
    mobilizations.forEach((m) => {
      if (m.project) {
        const projectName = m.project.name;
        byProject.set(projectName, (byProject.get(projectName) || 0) + 1);
      }
    });

    return {
      total: mobilizations.length,
      byMobStatus,
      byJobStatus,
      byProject: Array.from(byProject.entries()).map(([project, count]) => ({
        project,
        count,
      })),
    };
  }
}
