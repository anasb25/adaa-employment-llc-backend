import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, LessThanOrEqual } from 'typeorm';
import {
  Mobilization,
  MobStatus,
  JobStatus,
} from './entities/mobilization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Client } from '../clients/entities/client.entity';
import {
  CreateMobilizationDto,
  BulkCreateMobilizationDto,
} from './dto/create-mobilization.dto';
import { UpdateMobilizationDto } from './dto/update-mobilization.dto';
import { MobilizationFiltersDto } from './dto/mobilization-filters.dto';
import { ImportMobilizationResult } from './dto/import-mobilization.dto';
import {
  PaginationOptions,
  PaginationUtil,
} from '../../common/utils/pagination.util';
import { MobilizationExcelUtil } from './utils/mobilization-excel.util';

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
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
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

    // Note: Multiple mobilization records can exist for the same employee
    // This allows tracking mobilization history over time

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
      },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Get employee's effective mobilization status on a specific date
   * Returns the most recent mobilization record on or before the given date
   * This implements smart "carry forward" logic - temporary statuses don't carry forward
   */
  async getEffectiveStatusOnDate(
    employeeId: number,
    date: Date,
  ): Promise<Mobilization | null> {
    // Get all mobilizations for this employee up to the date
    const allMobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(date),
      },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    if (allMobilizations.length === 0) {
      return null;
    }

    // Apply smart carry-forward logic
    return this.applySmartCarryForward(allMobilizations, date);
  }

  /**
   * Get current mobilization status for all employees
   * Returns the most recent mobilization for each employee
   * Useful for dashboard/reporting views
   */
  async getCurrentStatusForAllEmployees(): Promise<Mobilization[]> {
    return this.getEffectiveStatusForAllEmployeesOnDate(new Date());
  }

  /**
   * Get effective status for all employees on a specific date (smart carry-forward logic)
   * Returns the most recent mobilization for each employee on or before the given date
   * Temporary statuses (absent, sick_leave, casual_leave) don't carry forward
   */
  async getEffectiveStatusForAllEmployeesOnDate(
    date: Date,
  ): Promise<Mobilization[]> {
    // Fetch all mobilizations up to and including the specified date
    const allMobilizations = await this.mobilizationRepository.find({
      where: {
        actionDate: LessThanOrEqual(date),
      },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
      order: {
        actionDate: 'DESC',
        createdAt: 'DESC',
      },
    });

    // Group by employee
    const employeeMobilizationsMap = new Map<number, Mobilization[]>();

    for (const mobilization of allMobilizations) {
      if (!employeeMobilizationsMap.has(mobilization.employeeId)) {
        employeeMobilizationsMap.set(mobilization.employeeId, []);
      }
      employeeMobilizationsMap.get(mobilization.employeeId)!.push(mobilization);
    }

    // Apply smart carry-forward logic for each employee
    const effectiveMobilizations: Mobilization[] = [];

    for (const [
      employeeId,
      mobilizations,
    ] of employeeMobilizationsMap.entries()) {
      const effective = this.applySmartCarryForward(mobilizations, date);
      if (effective) {
        effectiveMobilizations.push(effective);
      }
    }

    // Sort by employee name
    const result = effectiveMobilizations.sort((a, b) => {
      const nameA = a.employee?.name || '';
      const nameB = b.employee?.name || '';
      return nameA.localeCompare(nameB);
    });

    return result;
  }

  /**
   * Apply smart carry-forward logic to mobilization records
   * Temporary statuses (absent, sick_leave, casual_leave) don't carry forward
   * Respects project off days for carried-forward statuses
   */
  private applySmartCarryForward(
    mobilizations: Mobilization[],
    targetDate: Date,
  ): Mobilization | null {
    if (mobilizations.length === 0) {
      return null;
    }

    const latestMob = mobilizations[0]; // Already sorted by date DESC
    const latestMobDate = new Date(latestMob.actionDate);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const latestMobDateStr = latestMobDate.toISOString().split('T')[0];

    // List of temporary one-day statuses that should not carry forward
    const temporaryStatuses: string[] = [
      'absent',
      'sick_leave',
      'casual_leave',
    ];

    // If the latest mobilization is on the exact date we're looking at -> use it as-is
    // User explicitly entered this record, so we respect their choice even if it's an off day
    if (latestMobDateStr === targetDateStr) {
      return latestMob;
    }

    // We're carrying forward a status from a previous date
    // Check if target date is an off day for the project
    if (
      latestMob.project?.offDays &&
      Array.isArray(latestMob.project.offDays)
    ) {
      const dayOfWeek = this.getDayOfWeek(targetDate);
      if (latestMob.project.offDays.includes(dayOfWeek)) {
        // Target date is an off day - return OFF status
        return {
          ...latestMob,
          jobStatus: JobStatus.OFF,
        };
      }
    }

    // Latest mobilization is before the target date
    if (temporaryStatuses.includes(latestMob.jobStatus)) {
      // It's a temporary status - find the non-temporary status before it
      const nonTemporaryMob = mobilizations.find(
        (m, index) => index > 0 && !temporaryStatuses.includes(m.jobStatus),
      );

      if (nonTemporaryMob) {
        // Return a copy with the non-temporary job status but keep other fields from latest
        return {
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus as JobStatus,
        };
      }

      // If no non-temporary status found before, default to 'idle'
      return {
        ...latestMob,
        jobStatus: JobStatus.IDLE,
      };
    }

    // Latest mobilization is a permanent status - carry it forward
    return latestMob;
  }

  /**
   * Get the day of week name from a date
   */
  private getDayOfWeek(date: Date): string {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return days[date.getDay()];
  }

  /**
   * Get mobilization history for an employee within a date range
   * Shows all status changes that occurred during the period
   */
  async getEmployeeHistory(
    employeeId: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Mobilization[]> {
    const queryBuilder = this.mobilizationRepository
      .createQueryBuilder('mobilization')
      .leftJoinAndSelect('mobilization.employee', 'employee')
      .leftJoinAndSelect('mobilization.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('mobilization.mobilizedTrade', 'mobilizedTrade')
      .where('mobilization.employeeId = :employeeId', { employeeId })
      .orderBy('mobilization.actionDate', 'DESC')
      .addOrderBy('mobilization.createdAt', 'DESC');

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'mobilization.actionDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    } else if (startDate) {
      queryBuilder.andWhere('mobilization.actionDate >= :startDate', {
        startDate,
      });
    } else if (endDate) {
      queryBuilder.andWhere('mobilization.actionDate <= :endDate', { endDate });
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get all employees currently mobilized to a project
   */
  async getEmployeesOnProject(projectId: number): Promise<Mobilization[]> {
    return await this.mobilizationRepository.find({
      where: {
        projectId,
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
      .leftJoinAndSelect('mobilization.mobilizedTrade', 'mobilizedTrade');

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
      active: mobilizations.filter((m) => m.jobStatus === 'active').length,
      cancelled: mobilizations.filter((m) => m.jobStatus === 'cancelled')
        .length,
      absconded: mobilizations.filter((m) => m.jobStatus === 'absconded')
        .length,
      on_vacation: mobilizations.filter((m) => m.jobStatus === 'on_vacation')
        .length,
      absent: mobilizations.filter((m) => m.jobStatus === 'absent').length,
      sick_leave: mobilizations.filter((m) => m.jobStatus === 'sick_leave')
        .length,
      casual_leave: mobilizations.filter((m) => m.jobStatus === 'casual_leave')
        .length,
      notice_period: mobilizations.filter(
        (m) => m.jobStatus === 'notice_period',
      ).length,
      resigned: mobilizations.filter((m) => m.jobStatus === 'resigned').length,
      idle: mobilizations.filter((m) => m.jobStatus === 'idle').length,
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

  /**
   * Import mobilizations from Excel file
   * @param fileBuffer Excel file buffer
   * @returns Import result
   */
  async importMobilizations(
    fileBuffer: Buffer,
    createdBy: number,
  ): Promise<ImportMobilizationResult> {
    // Validate the Excel file structure
    const validation = MobilizationExcelUtil.validateExcelFile(fileBuffer);

    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    const result: ImportMobilizationResult = {
      success: 0,
      failed: 0,
      errors: [],
      imported: [],
    };

    // Process each row
    if (!validation.data) {
      throw new BadRequestException('No data found in Excel file');
    }

    for (let i = 0; i < validation.data.length; i++) {
      const row = validation.data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and has header row

      try {
        // Map Excel row to mobilization data
        const mappedData = MobilizationExcelUtil.mapRowToMobilization(row);

        // Validate required fields
        const validationErrors: string[] = [];

        if (!mappedData.employeeIdNo) {
          validationErrors.push('ID NO is required');
        }
        if (!mappedData.actionDate) {
          validationErrors.push('DATE is required');
        }

        // Validate MOB-DEM field
        if (!mappedData._validation.mobStatusValid) {
          validationErrors.push(
            `Invalid MOB-DEM value: "${mappedData._validation.originalMobDem}". Valid values are: "Mobilized" or "Demobilized"`,
          );
        }

        // Validate STATUS field
        if (!mappedData._validation.jobStatusValid) {
          validationErrors.push(
            `Invalid STATUS value: "${mappedData._validation.originalStatus}". Valid values are: Active, On Vacation, Cancelled, Absconded, Absent, Sick Leave, Casual Leave, Notice Period, Resigned, Idle`,
          );
        }

        // Validate CLIENT and SITE when MOB-DEM is "Mobilized"
        if (mappedData.mobStatus === 'mobilized') {
          if (!mappedData.clientName) {
            validationErrors.push(
              'CLIENT is required when MOB-DEM is "Mobilized"',
            );
          }
          if (!mappedData.siteName) {
            validationErrors.push(
              'SITE is required when MOB-DEM is "Mobilized"',
            );
          }
        }

        if (validationErrors.length > 0) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee:
              mappedData.employeeName || mappedData.employeeIdNo || 'Unknown',
            errors: validationErrors,
          });
          continue;
        }

        // Find employee by adaa_emp_code
        const employee = await this.employeeRepository.findOne({
          where: { adaa_emp_code: mappedData.employeeIdNo },
        });

        if (!employee) {
          result.failed++;
          result.errors.push({
            row: rowNumber,
            employee: mappedData.employeeName || 'Unknown',
            errors: [
              `Employee with ID NO '${mappedData.employeeIdNo}' not found`,
            ],
          });
          continue;
        }

        // Find or create mobilized trade (skill)
        let mobilizedTrade: any = null;

        // If mobilized trade is provided, use it
        if (mappedData.mobilizedTradeName) {
          mobilizedTrade = await this.skillRepository.findOne({
            where: { skill: ILike(mappedData.mobilizedTradeName) },
          });

          if (!mobilizedTrade) {
            // Create the skill if it doesn't exist
            mobilizedTrade = this.skillRepository.create({
              skill: mappedData.mobilizedTradeName,
            });
            mobilizedTrade = await this.skillRepository.save(mobilizedTrade);
          }
        } else {
          // If mobilized trade is not provided, use employee's first actual trade
          const employeeWithSkills = await this.employeeRepository.findOne({
            where: { id: employee.id },
            relations: ['employeeSkills', 'employeeSkills.skill'],
          });

          if (
            employeeWithSkills?.employeeSkills &&
            employeeWithSkills.employeeSkills.length > 0
          ) {
            mobilizedTrade = employeeWithSkills.employeeSkills[0].skill;
          } else {
            result.failed++;
            result.errors.push({
              row: rowNumber,
              employee:
                mappedData.employeeName || mappedData.employeeIdNo || 'Unknown',
              errors: [
                'MOBILIZED TRADE is missing and employee has no skills defined',
              ],
            });
            continue;
          }
        }

        // Find or create project if site name is provided
        let project: Project | null = null;
        if (mappedData.siteName) {
          // Try to find project by name
          project = await this.projectRepository.findOne({
            where: { name: ILike(mappedData.siteName) },
            relations: ['client'],
          });

          // If project not found and client name is provided, try to create it
          if (!project && mappedData.clientName) {
            // Find or create client
            let client = await this.clientRepository.findOne({
              where: { name: ILike(mappedData.clientName) },
            });

            if (!client) {
              client = this.clientRepository.create({
                name: mappedData.clientName,
              });
              client = await this.clientRepository.save(client);
            }

            // Create project
            project = this.projectRepository.create({
              name: mappedData.siteName,
              clientId: client.id,
            });
            project = await this.projectRepository.save(project);
          }
        }

        // Check if mobilization already exists for this employee on this date
        const existingMobilization = await this.mobilizationRepository.findOne({
          where: {
            employeeId: employee.id,
            actionDate: new Date(mappedData.actionDate),
          },
        });

        let mobilization: Mobilization;

        if (existingMobilization) {
          // Check if data has actually changed to avoid unnecessary updates
          const hasChanged =
            existingMobilization.mobilizedTradeId !== mobilizedTrade.id ||
            existingMobilization.projectId !== (project?.id || null) ||
            existingMobilization.mobStatus !== mappedData.mobStatus ||
            existingMobilization.jobStatus !== mappedData.jobStatus ||
            existingMobilization.notes !== mappedData.notes;

          if (hasChanged) {
            // Update existing mobilization
            await this.mobilizationRepository.update(existingMobilization.id, {
              mobilizedTradeId: mobilizedTrade.id,
              projectId: project?.id || null,
              mobStatus: mappedData.mobStatus as MobStatus,
              jobStatus: mappedData.jobStatus,
              notes: mappedData.notes,
              updatedBy: createdBy,
            });

            const updated = await this.mobilizationRepository.findOne({
              where: { id: existingMobilization.id },
              relations: ['employee', 'project', 'mobilizedTrade'],
            });

            if (!updated) {
              throw new Error('Failed to retrieve updated mobilization');
            }
            mobilization = updated;
          } else {
            // No changes, use existing record
            const existing = await this.mobilizationRepository.findOne({
              where: { id: existingMobilization.id },
              relations: ['employee', 'project', 'mobilizedTrade'],
            });

            if (!existing) {
              throw new Error('Failed to retrieve existing mobilization');
            }
            mobilization = existing;
          }
        } else {
          // Check if this is actually a change from previous status
          // (Optimization: Don't create a record if it's the same as the last one)
          const previousMobilization = await this.getEffectiveStatusOnDate(
            employee.id,
            new Date(
              new Date(mappedData.actionDate).getTime() - 24 * 60 * 60 * 1000,
            ),
          );

          const isDifferentFromPrevious =
            !previousMobilization ||
            previousMobilization.mobilizedTradeId !== mobilizedTrade.id ||
            previousMobilization.projectId !== (project?.id || null) ||
            previousMobilization.mobStatus !== mappedData.mobStatus ||
            previousMobilization.jobStatus !== mappedData.jobStatus;

          if (isDifferentFromPrevious) {
            // Create new mobilization (actual change occurred)
            const newMobilization = this.mobilizationRepository.create({
              employeeId: employee.id,
              mobilizedTradeId: mobilizedTrade.id,
              projectId: project?.id || null,
              mobStatus: mappedData.mobStatus as MobStatus,
              jobStatus: mappedData.jobStatus,
              actionDate: new Date(mappedData.actionDate),
              notes: mappedData.notes,
              createdBy,
            });

            mobilization =
              await this.mobilizationRepository.save(newMobilization);

            // Fetch with relations
            const saved = await this.mobilizationRepository.findOne({
              where: { id: mobilization.id },
              relations: ['employee', 'project', 'mobilizedTrade'],
            });

            if (!saved) {
              throw new Error('Failed to retrieve saved mobilization');
            }
            mobilization = saved;
          } else {
            // Status unchanged, skip creation (carried forward from previous)
            result.success++;
            continue;
          }
        }

        result.success++;
        result.imported.push({
          ...mobilization,
          updated: !!existingMobilization,
        });
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: rowNumber,
          employee: row['NAME'] || 'Unknown',
          errors: [error.message || 'Unknown error occurred'],
        });
      }
    }

    return result;
  }

  /**
   * Export all mobilizations to Excel format
   * @returns Excel buffer
   */
  async exportMobilizations(): Promise<Buffer> {
    const mobilizations = await this.mobilizationRepository.find({
      relations: [
        'employee',
        'employee.employeeSkills',
        'employee.employeeSkills.skill',
        'project',
        'project.client',
        'mobilizedTrade',
      ],
      order: { actionDate: 'DESC' },
    });

    return MobilizationExcelUtil.generateExport(mobilizations);
  }

  /**
   * Generate Excel template for import
   * @returns Excel buffer
   */
  generateImportTemplate(): Buffer {
    return MobilizationExcelUtil.generateTemplate();
  }
}
