import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Like,
} from 'typeorm';
import {
  Mobilization,
  MobStatus,
  JobStatus,
} from './entities/mobilization.entity';
import { Employee } from '../employees/entities/employee.entity';
import {
  DEFAULT_PROJECT_OFF_DAYS,
  getEffectiveProjectOffDays,
  Project,
} from '../projects/entities/project.entity';
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
import { SpecialDaysService } from '../special-days/special-days.service';
import { SpecialDayType } from '../special-days/entities/special-day.entity';
import { parseDateOnly, formatDateOnly, compareDateOnly } from '../../common/utils/date.util';
import {
  getEffectiveMobilizationForDate,
  isDaySpecificJobStatus,
  isPersistentUntilRemobStatus,
  normalizeMobilizationForProjectRoster,
} from '../../common/utils/effective-mobilization.util';
import { getMonthDateRange } from '../../common/utils/date.util';
import { TimesheetsService } from '../timesheets/timesheets.service';

@Injectable()
export class MobilizationsService {
  private readonly logger = new Logger(MobilizationsService.name);
  /** Tracks mob dates removed during an in-flight Excel import (re-import skip). */
  private importDeletedMobKeys: Set<string> | null = null;

  /** Statuses that demobilize the employee and clear project assignment. */
  private static readonly NO_PROJECT_JOB_STATUSES = new Set<string>([
    JobStatus.IDLE,
    JobStatus.ANNUAL_LEAVE,
    JobStatus.CANCELLED,
    JobStatus.ABSCONDED,
    JobStatus.RESIGNED,
    JobStatus.URGENT_LEAVE,
    'idle',
    'annual_leave',
    'cancelled',
    'absconded',
    'resigned',
    'urgent_leave',
  ]);

  /**
   * Business rule: idle / annual leave / terminal leave statuses are demobilized
   * with no project so they appear only on the idle + annual-leave timesheet, not
   * on any project grid from the leave start date onward.
   */
  private normalizeMobilizationWrite<
    T extends {
      jobStatus?: JobStatus | string | null;
      mobStatus?: MobStatus | string | null;
      projectId?: number | null;
    },
  >(data: T): T {
    const jobStatus = String(data.jobStatus ?? '').toLowerCase();
    if (MobilizationsService.NO_PROJECT_JOB_STATUSES.has(jobStatus)) {
      data.mobStatus = MobStatus.DEMOBILIZED;
      data.projectId = null;
    }
    return data;
  }

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
    private specialDaysService: SpecialDaysService,
    @Inject(forwardRef(() => TimesheetsService))
    private timesheetsService: TimesheetsService,
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

    const normalizedDto = this.normalizeMobilizationWrite({ ...createDto });
    const mobilization = this.mobilizationRepository.create({
      ...normalizedDto,
      createdBy,
    });

    const saved = await this.mobilizationRepository.save(mobilization);

    await this.cleanupConflictingAutoSyncedMobs(
      saved.employeeId,
      saved.projectId,
      saved.actionDate,
    );
    if (saved.jobStatus === JobStatus.ANNUAL_LEAVE) {
      await this.cleanupFutureAutoSyncedMobsAfterLeave(
        saved.employeeId,
        saved.actionDate,
      );
    }
    await this.autoSyncTimesheet(saved);

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
    const mobilizations = createDto.employeeIds.map((employeeId) =>
      this.normalizeMobilizationWrite({
        employeeId,
        mobilizedTradeId: createDto.mobilizedTradeId,
        projectId: createDto.projectId,
        mobStatus: createDto.mobStatus,
        jobStatus: createDto.jobStatus,
        actionDate: createDto.actionDate,
        notes: createDto.notes,
        createdBy,
      }),
    );

    const entities = this.mobilizationRepository.create(mobilizations);

    const saved = await this.mobilizationRepository.save(entities);

    for (const mob of saved) {
      await this.cleanupConflictingAutoSyncedMobs(
        mob.employeeId,
        mob.projectId,
        mob.actionDate,
      );
      if (mob.jobStatus === JobStatus.ANNUAL_LEAVE) {
        await this.cleanupFutureAutoSyncedMobsAfterLeave(
          mob.employeeId,
          mob.actionDate,
        );
      }
      await this.autoSyncTimesheet(mob);
    }

    this.logger.log(
      `Created ${saved.length} mobilization records for ${createDto.employeeIds.length} employees`,
    );

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

    // When viewing a specific date, show each employee's effective status (not stale
    // auto-synced rows that would mask annual leave / terminal statuses).
    if (filters?.actionDate) {
      const targetDate = parseDateOnly(filters.actionDate);
      const seen = new Set<number>();
      const effectiveData: Mobilization[] = [];
      for (const mob of data) {
        if (seen.has(mob.employeeId)) continue;
        seen.add(mob.employeeId);
        const effective = await this.getEffectiveStatusOnDate(
          mob.employeeId,
          targetDate,
        );
        if (effective) {
          effectiveData.push(normalizeMobilizationForProjectRoster(effective));
        }
      }
      return PaginationUtil.createPaginatedResponse(
        effectiveData,
        effectiveData.length,
        options.page,
        options.limit,
      );
    }

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
   * Get latest effective mobilization for an employee (carry-forward aware).
   */
  async getLatestForEmployee(employeeId: number): Promise<Mobilization | null> {
    return this.getEffectiveStatusOnDate(employeeId, new Date());
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
    // actionDate is now a string, so we use string comparison
    const dateStr = formatDateOnly(date);
    const allMobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(dateStr) as any,
      },
      relations: ['employee', 'project', 'project.client', 'mobilizedTrade'],
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    if (allMobilizations.length === 0) {
      return null;
    }

    // Apply smart carry-forward logic
    return await this.applySmartCarryForward(allMobilizations, date);
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
   * @param includeDemobilized If true, includes employees whose effective status is DEMOBILIZED
   */
  async getEffectiveStatusForAllEmployeesOnDate(
    date: Date,
    includeDemobilized: boolean = false,
  ): Promise<Mobilization[]> {
    // Fetch all mobilizations up to and including the specified date
    // actionDate is now a string, so we use string comparison
    const dateStr = formatDateOnly(date);
    const allMobilizations = await this.mobilizationRepository.find({
      where: {
        actionDate: LessThanOrEqual(dateStr) as any,
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

    // Pre-fetch special day rates once per project (not once per employee).
    const specialDayRatesCache =
      await this.buildSpecialDayRatesCache(date, allMobilizations);

    // Apply smart carry-forward logic for each employee
    const effectiveMobilizations: Mobilization[] = [];

    for (const [, mobilizations] of employeeMobilizationsMap.entries()) {
      const effective = await this.applySmartCarryForward(
        mobilizations,
        date,
        specialDayRatesCache,
      );
      if (effective) {
        effectiveMobilizations.push(
          normalizeMobilizationForProjectRoster(effective),
        );
      }
    }

    // Optionally exclude demobilized employees: demobilization is sustained until remobilized.
    // For "current status" views (dashboard), we exclude them.
    // For daily mobilization management (carry-forward view), we include them so users can
    // see demobilization events that happened on a specific date.
    const filtered = includeDemobilized
      ? effectiveMobilizations
      : effectiveMobilizations.filter(
          (m) => m.mobStatus !== MobStatus.DEMOBILIZED,
        );

    // Sort by employee name
    const result = filtered.sort((a, b) => {
      const nameA = a.employee?.name || '';
      const nameB = b.employee?.name || '';
      return nameA.localeCompare(nameB);
    });

    return result;
  }

  /**
   * Apply smart carry-forward logic to mobilization records.
   * Annual leave / idle / terminal statuses persist until a real remobilization.
   * Temporary statuses (absent, sick_leave, casual_leave) don't carry forward.
   * Respects project off days and special days for active project workers.
   */
  private async buildSpecialDayRatesCache(
    targetDate: Date,
    allMobilizations: Mobilization[],
  ): Promise<Map<number | null, Awaited<ReturnType<SpecialDaysService['getSpecialDayRates']>>>> {
    const cache = new Map<
      number | null,
      Awaited<ReturnType<SpecialDaysService['getSpecialDayRates']>>
    >();
    const projectIds = new Set<number>();
    for (const mob of allMobilizations) {
      if (mob.projectId != null) {
        projectIds.add(mob.projectId);
      }
    }
    cache.set(
      null,
      await this.specialDaysService.getSpecialDayRates(targetDate),
    );
    await Promise.all(
      [...projectIds].map(async (projectId) => {
        cache.set(
          projectId,
          await this.specialDaysService.getSpecialDayRates(
            targetDate,
            projectId,
          ),
        );
      }),
    );
    return cache;
  }

  private async applySmartCarryForward(
    mobilizations: Mobilization[],
    targetDate: Date,
    specialDayRatesCache?: Map<
      number | null,
      Awaited<ReturnType<SpecialDaysService['getSpecialDayRates']>>
    >,
  ): Promise<Mobilization | null> {
    if (mobilizations.length === 0) {
      return null;
    }

    const targetDateStr = formatDateOnly(targetDate);
    const baseEffective = getEffectiveMobilizationForDate(
      mobilizations,
      targetDateStr,
    );
    if (!baseEffective) {
      return null;
    }

    if (isPersistentUntilRemobStatus(baseEffective.jobStatus)) {
      return normalizeMobilizationForProjectRoster(baseEffective);
    }

    const latestMob = baseEffective;
    const latestMobDateStr = formatDateOnly(latestMob.actionDate);

    // List of temporary one-day statuses that should not carry forward
    const temporaryStatuses: string[] = [
      'absent',
      'sick_leave',
      'casual_leave',
      'urgent_leave',
      'off',
    ];

    // If the effective mobilization is on the exact date we're looking at -> use it as-is
    if (latestMobDateStr === targetDateStr) {
      return normalizeMobilizationForProjectRoster(latestMob);
    }

    // We're carrying forward a status from a previous date
    // Check for special days first (higher priority than project off days).
    const projectKey = latestMob.projectId ?? null;
    let specialDayRates = specialDayRatesCache?.get(projectKey);
    if (!specialDayRates) {
      specialDayRates = await this.specialDaysService.getSpecialDayRates(
        targetDate,
        latestMob.projectId ?? undefined,
      );
      specialDayRatesCache?.set(projectKey, specialDayRates);
    }

    if (specialDayRates.isSpecialDay) {
      if (specialDayRates.isMandatoryOff) {
        return normalizeMobilizationForProjectRoster({
          ...latestMob,
          jobStatus: JobStatus.OFF,
        });
      }

      if (
        specialDayRates.dayType === SpecialDayType.OPTIONAL_OFF ||
        specialDayRates.isDefaultOff
      ) {
        return normalizeMobilizationForProjectRoster({
          ...latestMob,
          jobStatus: JobStatus.OFF,
        });
      }
    }

    // Check if target date is a project off day (defaults to Sunday when unset)
    const offDays = getEffectiveProjectOffDays(latestMob.project);
    if (offDays.length > 0) {
      const dayOfWeek = this.getDayOfWeek(targetDate);
      if (offDays.includes(dayOfWeek)) {
        return normalizeMobilizationForProjectRoster({
          ...latestMob,
          jobStatus: JobStatus.OFF,
        });
      }
    }

    if (temporaryStatuses.includes(latestMob.jobStatus)) {
      const nonTemporaryMob = mobilizations.find(
        (m, index) => index > 0 && !temporaryStatuses.includes(m.jobStatus),
      );

      if (nonTemporaryMob) {
        return normalizeMobilizationForProjectRoster({
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus as JobStatus,
        });
      }

      return normalizeMobilizationForProjectRoster({
        ...latestMob,
        jobStatus: JobStatus.IDLE,
      });
    }

    return normalizeMobilizationForProjectRoster(latestMob);
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
    return days[date.getUTCDay()];
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
   * Get all employees currently assigned to a project (effective status today).
   */
  async getEmployeesOnProject(projectId: number): Promise<Mobilization[]> {
    const effectiveToday = await this.getEffectiveStatusForAllEmployeesOnDate(
      new Date(),
      true,
    );
    return effectiveToday.filter((m) => m.projectId === projectId);
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

    // Normalize: if the effective jobStatus after this update is IDLE, force
    // mobStatus=DEMOBILIZED and projectId=null regardless of what the caller sent.
    const effectiveJobStatus = updateDto.jobStatus ?? existing.jobStatus;
    const normalizedUpdate = this.normalizeMobilizationWrite({
      ...updateDto,
      jobStatus: effectiveJobStatus,
    });

    await this.mobilizationRepository.update(id, {
      ...normalizedUpdate,
      updatedBy,
    });

    const result = await this.findOne(id);
    if (!result) {
      throw new NotFoundException('Failed to retrieve updated mobilization');
    }

    await this.cleanupConflictingAutoSyncedMobs(
      result.employeeId,
      result.projectId,
      result.actionDate,
    );
    if (result.jobStatus === JobStatus.ANNUAL_LEAVE) {
      await this.cleanupFutureAutoSyncedMobsAfterLeave(
        result.employeeId,
        result.actionDate,
      );
    }
    const previousProjectId =
      existing.projectId !== result.projectId ? existing.projectId : null;
    await this.autoSyncTimesheet(result, previousProjectId);

    return result;
  }

  /**
   * Delete mobilization (hard delete)
   */
  async remove(id: number, _deletedBy?: number): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Mobilization not found');
    }

    await this.mobilizationRepository.delete(id);
  }

  async removeMany(ids: number[]): Promise<{ deleted: number }> {
    const result = await this.mobilizationRepository.delete(ids);
    return { deleted: result.affected || 0 };
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
      annual_leave: mobilizations.filter((m) => m.jobStatus === 'annual_leave')
        .length,
      absent: mobilizations.filter((m) => m.jobStatus === 'absent').length,
      sick_leave: mobilizations.filter((m) => m.jobStatus === 'sick_leave')
        .length,
      casual_leave: mobilizations.filter((m) => m.jobStatus === 'casual_leave')
        .length,
      urgent_leave: mobilizations.filter((m) => m.jobStatus === 'urgent_leave')
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

    // Chronological order per employee so an earlier stint start consolidates
    // before a later row can re-split the month (e.g. Aug 1 LASR before Aug 10 AL A2M).
    const sortedRows = [...validation.data].sort((rowA, rowB) => {
      const idA = String(rowA['ID NO'] ?? '').trim();
      const idB = String(rowB['ID NO'] ?? '').trim();
      const idCmp = idA.localeCompare(idB);
      if (idCmp !== 0) {
        return idCmp;
      }

      const dateA = MobilizationExcelUtil.excelDateToISO(rowA['DATE']) ?? '';
      const dateB = MobilizationExcelUtil.excelDateToISO(rowB['DATE']) ?? '';
      return compareDateOnly(dateA, dateB);
    });

    this.importDeletedMobKeys = new Set<string>();

    try {
    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
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

        // Validate STATUS field (mobStatus is derived from STATUS, no MOB-DEM column needed)
        if (!mappedData._validation.jobStatusValid) {
          validationErrors.push(
            `Invalid STATUS value: "${mappedData._validation.originalStatus}". Valid values are: Active, Annual Leave, Urgent Leave, Cancelled, Absconded, Absent, Sick Leave, Casual Leave, Notice Period, Resigned, Idle, Off`,
          );
        }

        // Validate CLIENT and SITE when status implies Mobilized
        if (mappedData.mobStatus === 'mobilized') {
          if (!mappedData.clientName) {
            validationErrors.push(
              'CLIENT is required when STATUS implies Mobilized',
            );
          }
          if (!mappedData.siteName) {
            validationErrors.push(
              'SITE is required when STATUS implies Mobilized',
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

          if (
            project &&
            (!project.offDays ||
              !Array.isArray(project.offDays) ||
              project.offDays.length === 0)
          ) {
            project.offDays = [...DEFAULT_PROJECT_OFF_DAYS];
            project = await this.projectRepository.save(project);
          }

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

            // Create project (Sunday off matches existing project defaults)
            project = this.projectRepository.create({
              name: mappedData.siteName,
              clientId: client.id,
              offDays: [...DEFAULT_PROJECT_OFF_DAYS],
            });
            project = await this.projectRepository.save(project);
          }
        }

        // Check if mobilization already exists for this employee on this date
        // actionDate is now a string (YYYY-MM-DD)
        const existingMobilization = await this.mobilizationRepository.findOne({
          where: {
            employeeId: employee.id,
            actionDate: mappedData.actionDate as any, // TypeORM will handle the transformer
          },
        });

        const actionDateStr = mappedData.actionDate as string;

        if (
          this.importDeletedMobKeys?.has(`${employee.id}|${actionDateStr}`)
        ) {
          result.success++;
          continue;
        }

        let mobilization: Mobilization;
        let previousProjectIdBeforeUpdate: number | null = null;

        if (existingMobilization) {
          previousProjectIdBeforeUpdate =
            existingMobilization.projectId ?? null;

          // Check if data has actually changed to avoid unnecessary updates
          const hasChanged =
            existingMobilization.mobilizedTradeId !== mobilizedTrade.id ||
            existingMobilization.projectId !== (project?.id || null) ||
            existingMobilization.mobStatus !== mappedData.mobStatus ||
            existingMobilization.jobStatus !== mappedData.jobStatus ||
            existingMobilization.notes !== mappedData.notes;

          if (hasChanged) {
            // Update existing mobilization (normalized: idle => demobilized + null project)
            const updatePayload = this.normalizeMobilizationWrite({
              mobilizedTradeId: mobilizedTrade.id,
              projectId: project?.id || null,
              mobStatus: mappedData.mobStatus as MobStatus,
              jobStatus: mappedData.jobStatus as JobStatus,
              notes: mappedData.notes,
              updatedBy: createdBy,
            });
            await this.mobilizationRepository.update(
              existingMobilization.id,
              updatePayload,
            );

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
          // Calculate previous day in timezone-neutral way
          const actionDateParts = mappedData.actionDate.split('-');
          const actionDateObj = new Date(
            Date.UTC(
              parseInt(actionDateParts[0]),
              parseInt(actionDateParts[1]) - 1,
              parseInt(actionDateParts[2]),
            ),
          );
          const previousDayObj = new Date(
            actionDateObj.getTime() - 24 * 60 * 60 * 1000,
          );

          const previousMobilization = await this.getEffectiveStatusOnDate(
            employee.id,
            previousDayObj,
          );

          const isDifferentFromPrevious =
            !previousMobilization ||
            previousMobilization.mobilizedTradeId !== mobilizedTrade.id ||
            previousMobilization.projectId !== (project?.id || null) ||
            previousMobilization.mobStatus !== mappedData.mobStatus ||
            previousMobilization.jobStatus !== mappedData.jobStatus;

          // Day-specific statuses (absent, sick leave, etc.) need an explicit row
          // per date — they do not carry forward, so skip-if-unchanged would leave
          // the target day showing the prior day's active status after import.
          const requiresExplicitDayRecord = isDaySpecificJobStatus(
            mappedData.jobStatus,
          );

          if (isDifferentFromPrevious || requiresExplicitDayRecord) {
            // Create new mobilization (actual change occurred)
            // actionDate is already a YYYY-MM-DD string from Excel import
            const createPayload = this.normalizeMobilizationWrite({
              employeeId: employee.id,
              mobilizedTradeId: mobilizedTrade.id,
              projectId: project?.id || null,
              mobStatus: mappedData.mobStatus as MobStatus,
              jobStatus: mappedData.jobStatus as JobStatus,
              actionDate: mappedData.actionDate as any, // TypeORM will handle the transformer
              notes: mappedData.notes,
              createdBy,
            });
            const newMobilization =
              this.mobilizationRepository.create(createPayload);

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

        await this.cleanupConflictingAutoSyncedMobs(
          employee.id,
          project?.id ?? null,
          mappedData.actionDate,
        );
        if (mobilization.jobStatus === JobStatus.ANNUAL_LEAVE) {
          await this.cleanupFutureAutoSyncedMobsAfterLeave(
            employee.id,
            mobilization.actionDate,
          );
        }
        await this.autoSyncTimesheet(
          mobilization,
          previousProjectIdBeforeUpdate != null &&
            previousProjectIdBeforeUpdate !== mobilization.projectId
            ? previousProjectIdBeforeUpdate
            : undefined,
        );

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
          //@ts-ignore
          errors: [error.message || 'Unknown error occurred'],
        });
      }
    }
    } finally {
      this.importDeletedMobKeys = null;
    }

    return result;
  }

  private async autoSyncTimesheet(
    mob: Mobilization,
    explicitPreviousProjectId?: number | null,
  ): Promise<void> {
    try {
      const actionDateStr = formatDateOnly(mob.actionDate);
      const month = actionDateStr.slice(0, 7);
      const fromProject =
        explicitPreviousProjectId ??
        (await this.resolvePriorProjectForTransfer(
          mob.employeeId,
          actionDateStr,
          mob.projectId,
        ));

      const transferHandled = Boolean(
        mob.projectId &&
          mob.mobStatus === MobStatus.MOBILIZED &&
          !MobilizationsService.NO_PROJECT_JOB_STATUSES.has(
            String(mob.jobStatus).toLowerCase(),
          ) &&
          fromProject &&
          fromProject !== mob.projectId,
      );

      if (transferHandled) {
        const transferRangeEnd = await this.resolveMobilizationShiftRangeEnd(mob);

        await this.reassignMobilizationsOnProjectTransfer(
          mob.employeeId,
          actionDateStr,
          fromProject!,
          mob.projectId!,
          mob.updatedBy ?? mob.createdBy ?? 1,
          transferRangeEnd,
        );
        await this.timesheetsService.shiftTimesheetEntriesOnProjectTransfer(
          mob.employeeId,
          actionDateStr,
          fromProject!,
          mob.projectId!,
          mob.updatedBy ?? mob.createdBy ?? 1,
          transferRangeEnd,
        );
        await this.timesheetsService.materializeTransferredTimesheetEntries(
          mob.employeeId,
          actionDateStr,
          fromProject!,
          mob.projectId!,
          mob.updatedBy ?? mob.createdBy ?? 1,
          transferRangeEnd,
        );
        await this.timesheetsService.clearProjectTimesheetEntriesInRange(
          mob.employeeId,
          fromProject!,
          month,
          actionDateStr,
          transferRangeEnd,
        );
        await this.cleanupMobilizationsOnOldProjectAfterTransfer(
          mob.employeeId,
          fromProject!,
          mob.projectId!,
          actionDateStr,
        );

        if (this.isProjectStintStartStatus(mob.jobStatus)) {
          await this.cleanupLaterOtherProjectStintStartsAfterDate(
            mob.employeeId,
            mob.projectId!,
            actionDateStr,
            month,
            mob.id,
          );
        }
      }

      if (
        mob.projectId &&
        mob.mobStatus === MobStatus.MOBILIZED &&
        this.isProjectStintStartStatus(mob.jobStatus)
      ) {
        await this.syncEarlierProjectStintStart(
          mob,
          mob.updatedBy ?? mob.createdBy ?? 1,
        );
        await this.cleanupPriorSameProjectMobilizationsBeforeStart(
          mob.employeeId,
          mob.projectId,
          actionDateStr,
          mob.updatedBy ?? mob.createdBy ?? 1,
        );
      }

      await this.reconcileCrossProjectTimesheetEntries(
        mob,
        mob.updatedBy ?? mob.createdBy ?? 1,
      );

      await this.timesheetsService.syncTimesheetFromMobilization(
        mob.employeeId,
        actionDateStr,
      );

      if (
        mob.projectId &&
        mob.mobStatus === MobStatus.MOBILIZED &&
        !MobilizationsService.NO_PROJECT_JOB_STATUSES.has(
          String(mob.jobStatus).toLowerCase(),
        )
      ) {
        await this.timesheetsService.enforceProjectCalendarForEmployeeOnProject(
          mob.employeeId,
          mob.projectId,
          month,
          actionDateStr,
        );
        await this.timesheetsService.repairAutoActiveOnProjectOffDays(
          month,
          mob.employeeId,
        );
      }

      await this.timesheetsService.pruneStaleTimesheetEntriesForEmployeeMonth(
        mob.employeeId,
        month,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-sync timesheet for employee ${mob.employeeId} on ${formatDateOnly(mob.actionDate)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isProjectStintStartStatus(jobStatus: JobStatus | string): boolean {
    const normalized = String(jobStatus).toLowerCase();
    return (
      normalized === JobStatus.ACTIVE || normalized === JobStatus.NOTICE_PERIOD
    );
  }

  /**
   * Date range for pulling timesheet rows onto the mobilization project.
   * Active stint starts consolidate from actionDate through month-end on the
   * target project (e.g. mobilize LASR from Aug 1 also pulls AL A2M Aug 10+).
   * Capped only when a later active start exists on the same project (Aug 1–9
   * pull when Aug 10 start remains on that same project).
   */
  private async resolveMobilizationShiftRangeEnd(
    mob: Mobilization,
  ): Promise<string> {
    const actionDateStr = formatDateOnly(mob.actionDate);
    const month = actionDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);

    if (
      !mob.projectId ||
      !this.isProjectStintStartStatus(mob.jobStatus)
    ) {
      return this.timesheetsService.resolveTransferRangeEnd(
        mob.employeeId,
        mob.projectId!,
        actionDateStr,
      );
    }

    const laterStartDateStr = await this.findLaterSameProjectStintStart(
      mob.employeeId,
      mob.projectId,
      actionDateStr,
      month,
      mob.id,
    );

    if (laterStartDateStr) {
      return this.minDateOnly(
        monthEnd,
        this.dayBeforeDateOnly(laterStartDateStr),
      );
    }

    return monthEnd;
  }

  /**
   * When consolidating onto project P from D, later active/notice starts on
   * other projects (e.g. Aug 10 AL A2M after Aug 1 LASR) are superseded.
   */
  private async cleanupLaterOtherProjectStintStartsAfterDate(
    employeeId: number,
    targetProjectId: number,
    fromDateStr: string,
    month: string,
    excludeMobilizationId?: number,
  ): Promise<void> {
    const { end: monthEnd } = getMonthDateRange(month);

    const qb = this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId IS NOT NULL')
      .andWhere('m.projectId != :targetProjectId', { targetProjectId })
      .andWhere('m.actionDate > :fromDate', { fromDate: fromDateStr })
      .andWhere('m.actionDate <= :monthEnd', { monthEnd })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.jobStatus IN (:...startStatuses)', {
        startStatuses: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      });

    if (excludeMobilizationId) {
      qb.andWhere('m.id != :excludeMobilizationId', { excludeMobilizationId });
    }

    const stale = await qb.getMany();
    if (stale.length === 0) {
      return;
    }

    await this.mobilizationRepository.remove(stale);
    if (this.importDeletedMobKeys) {
      for (const mob of stale) {
        this.importDeletedMobKeys.add(
          `${employeeId}|${formatDateOnly(mob.actionDate)}`,
        );
      }
    }
    this.logger.log(
      `Removed ${stale.length} superseded later mobilization start(s) on other project(s) ` +
        `for employee ${employeeId} after ${fromDateStr} (consolidated onto project ${targetProjectId})`,
    );
  }

  /**
   * When a stint start on project A moves earlier (e.g. A was Aug 10–31, B was
   * Aug 1–9, import mobilizes A from Aug 1), shift Aug 1–9 timesheet rows from
   * other projects into A without changing Aug 10+ on A.
   */
  private async syncEarlierProjectStintStart(
    mob: Mobilization,
    updatedBy: number,
  ): Promise<void> {
    if (!mob.projectId) {
      return;
    }

    const newStartDateStr = formatDateOnly(mob.actionDate);
    const month = newStartDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);

    const laterStartDateStr = await this.findLaterSameProjectStintStart(
      mob.employeeId,
      mob.projectId,
      newStartDateStr,
      month,
      mob.id,
    );

    let rangeEnd = monthEnd;

    if (laterStartDateStr) {
      rangeEnd = this.minDateOnly(
        rangeEnd,
        this.dayBeforeDateOnly(laterStartDateStr),
      );
    }

    if (compareDateOnly(rangeEnd, newStartDateStr) < 0) {
      return;
    }

    const sourceProjectIds = new Set<number>(
      await this.timesheetsService.findOtherProjectIdsWithEntriesInRange(
        mob.employeeId,
        month,
        newStartDateStr,
        rangeEnd,
        mob.projectId,
      ),
    );

    for (const projectId of await this.findOtherProjectIdsFromMobilizationsInRange(
      mob.employeeId,
      month,
      newStartDateStr,
      rangeEnd,
      mob.projectId,
    )) {
      sourceProjectIds.add(projectId);
    }

    if (sourceProjectIds.size === 0) {
      if (laterStartDateStr) {
        await this.cleanupLaterSameProjectMobilizationsAfterStart(
          mob.employeeId,
          mob.projectId,
          newStartDateStr,
        );
      }
      return;
    }

    for (const fromProjectId of sourceProjectIds) {
      await this.reassignMobilizationsOnProjectTransfer(
        mob.employeeId,
        newStartDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
      await this.timesheetsService.shiftTimesheetEntriesOnProjectTransfer(
        mob.employeeId,
        newStartDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
      await this.timesheetsService.clearProjectTimesheetEntriesInRange(
        mob.employeeId,
        fromProjectId,
        month,
        newStartDateStr,
        rangeEnd,
      );
      await this.cleanupMobilizationsOnOldProjectInRange(
        mob.employeeId,
        fromProjectId,
        newStartDateStr,
        rangeEnd,
      );
    }

    for (const fromProjectId of sourceProjectIds) {
      await this.timesheetsService.materializeTransferredTimesheetEntries(
        mob.employeeId,
        newStartDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
    }

    if (laterStartDateStr) {
      await this.cleanupLaterSameProjectMobilizationsAfterStart(
        mob.employeeId,
        mob.projectId,
        newStartDateStr,
      );
    }

    await this.cleanupLaterOtherProjectStintStartsAfterDate(
      mob.employeeId,
      mob.projectId,
      newStartDateStr,
      month,
      mob.id,
    );

    this.logger.log(
      `Earlier stint start for employee ${mob.employeeId} on project ${mob.projectId} ` +
        `from ${newStartDateStr} to ${rangeEnd}; shifted from project(s) ${[...sourceProjectIds].join(', ')}`,
    );
  }

  /**
   * Pull saved timesheet rows from any other project in this stint window onto the
   * mobilization target project through month-end (or until a later start on the
   * same project), e.g. mobilize LASR from Aug 1 also pulls AL A2M Aug 10+.
   */
  private async reconcileCrossProjectTimesheetEntries(
    mob: Mobilization,
    updatedBy: number,
  ): Promise<void> {
    if (
      !mob.projectId ||
      mob.mobStatus !== MobStatus.MOBILIZED ||
      !this.isProjectStintStartStatus(mob.jobStatus)
    ) {
      return;
    }

    const actionDateStr = formatDateOnly(mob.actionDate);
    const month = actionDateStr.slice(0, 7);
    const rangeEnd = await this.resolveMobilizationShiftRangeEnd(mob);

    if (compareDateOnly(rangeEnd, actionDateStr) < 0) {
      return;
    }

    const sourceProjectIds =
      await this.timesheetsService.findOtherProjectIdsWithEntriesInRange(
        mob.employeeId,
        month,
        actionDateStr,
        rangeEnd,
        mob.projectId,
      );

    if (sourceProjectIds.length === 0) {
      return;
    }

    for (const fromProjectId of sourceProjectIds) {
      await this.reassignMobilizationsOnProjectTransfer(
        mob.employeeId,
        actionDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
      await this.timesheetsService.shiftTimesheetEntriesOnProjectTransfer(
        mob.employeeId,
        actionDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
      await this.timesheetsService.clearProjectTimesheetEntriesInRange(
        mob.employeeId,
        fromProjectId,
        month,
        actionDateStr,
        rangeEnd,
      );
      await this.cleanupMobilizationsOnOldProjectInRange(
        mob.employeeId,
        fromProjectId,
        actionDateStr,
        rangeEnd,
      );
    }

    for (const fromProjectId of sourceProjectIds) {
      await this.timesheetsService.materializeTransferredTimesheetEntries(
        mob.employeeId,
        actionDateStr,
        fromProjectId,
        mob.projectId,
        updatedBy,
        rangeEnd,
      );
    }

    const laterStartDateStr = await this.findLaterSameProjectStintStart(
      mob.employeeId,
      mob.projectId,
      actionDateStr,
      month,
      mob.id,
    );
    if (laterStartDateStr) {
      await this.cleanupLaterSameProjectMobilizationsAfterStart(
        mob.employeeId,
        mob.projectId,
        actionDateStr,
      );
    }

    await this.cleanupLaterOtherProjectStintStartsAfterDate(
      mob.employeeId,
      mob.projectId,
      actionDateStr,
      month,
      mob.id,
    );

    this.logger.log(
      `Reconciled cross-project timesheet for employee ${mob.employeeId} onto project ${mob.projectId} ` +
        `from ${actionDateStr} to ${rangeEnd}; merged from project(s) ${sourceProjectIds.join(', ')}`,
    );
  }

  /** Re-run timesheet sync/transfer logic for an existing mobilization row. */
  async resyncTimesheetForMobilization(
    mobilizationId: number,
    updatedBy: number,
  ): Promise<void> {
    const mob = await this.findOne(mobilizationId);
    if (!mob) {
      throw new NotFoundException('Mobilization not found');
    }
    await this.autoSyncTimesheet(mob);
  }

  /** Next active/notice stint start on another project after newStartDateStr. */
  private async findEarliestOtherProjectStintStartAfterDate(
    employeeId: number,
    excludeProjectId: number,
    afterDateStr: string,
    month: string,
    excludeMobilizationId?: number,
  ): Promise<string | null> {
    const { end: monthEnd } = getMonthDateRange(month);

    const qb = this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId IS NOT NULL')
      .andWhere('m.projectId != :excludeProjectId', { excludeProjectId })
      .andWhere('m.actionDate > :afterDate', { afterDate: afterDateStr })
      .andWhere('m.actionDate <= :monthEnd', { monthEnd })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.jobStatus IN (:...startStatuses)', {
        startStatuses: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      })
      .orderBy('m.actionDate', 'ASC')
      .limit(1);

    if (excludeMobilizationId) {
      qb.andWhere('m.id != :excludeMobilizationId', { excludeMobilizationId });
    }

    const earliest = await qb.getOne();
    return earliest ? formatDateOnly(earliest.actionDate) : null;
  }

  private minDateOnly(a: string, b: string): string {
    return compareDateOnly(a, b) <= 0 ? a : b;
  }

  private dayBeforeDateOnly(dateStr: string): string {
    const dayBefore = parseDateOnly(dateStr);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    return formatDateOnly(dayBefore);
  }

  /** Next active/notice stint start on the same project after newStartDateStr. */
  private async findLaterSameProjectStintStart(
    employeeId: number,
    projectId: number,
    newStartDateStr: string,
    month: string,
    excludeMobilizationId?: number,
  ): Promise<string | null> {
    const { end: monthEnd } = getMonthDateRange(month);

    const qb = this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :projectId', { projectId })
      .andWhere('m.actionDate > :newStartDate', { newStartDate: newStartDateStr })
      .andWhere('m.actionDate <= :monthEnd', { monthEnd })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.jobStatus IN (:...startStatuses)', {
        startStatuses: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      })
      .orderBy('m.actionDate', 'ASC')
      .limit(1);

    if (excludeMobilizationId) {
      qb.andWhere('m.id != :excludeMobilizationId', { excludeMobilizationId });
    }

    const laterStart = await qb.getOne();
    return laterStart ? formatDateOnly(laterStart.actionDate) : null;
  }

  private async findOtherProjectIdsFromMobilizationsInRange(
    employeeId: number,
    month: string,
    rangeStart: string,
    rangeEnd: string,
    excludeProjectId: number,
  ): Promise<number[]> {
    const { end: monthEnd } = getMonthDateRange(month);

    const mobs = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId IS NOT NULL')
      .andWhere('m.projectId != :excludeProjectId', { excludeProjectId })
      .andWhere('m.actionDate >= :rangeStart', { rangeStart })
      .andWhere('m.actionDate <= :rangeEnd', { rangeEnd: rangeEnd <= monthEnd ? rangeEnd : monthEnd })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .getMany();

    return [
      ...new Set(
        mobs
          .map((m) => m.projectId)
          .filter((id): id is number => id != null && id !== excludeProjectId),
      ),
    ];
  }

  /**
   * When stint start moves earlier on the same project, drop the superseded
   * later start row (e.g. Aug 10 start removed when Aug 1 becomes the start).
   */
  private async cleanupLaterSameProjectMobilizationsAfterStart(
    employeeId: number,
    projectId: number,
    newStartDateStr: string,
  ): Promise<void> {
    const month = newStartDateStr.slice(0, 7);
    const laterStarts = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :projectId', { projectId })
      .andWhere('m.actionDate > :newStartDate', { newStartDate: newStartDateStr })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.jobStatus IN (:...startStatuses)', {
        startStatuses: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      })
      .getMany();

    if (laterStarts.length === 0) {
      return;
    }

    await this.mobilizationRepository.remove(laterStarts);
    this.logger.log(
      `Removed ${laterStarts.length} superseded later mobilization start(s) for employee ${employeeId} ` +
        `on project ${projectId} after ${newStartDateStr}`,
    );
  }

  private async cleanupMobilizationsOnOldProjectInRange(
    employeeId: number,
    fromProjectId: number,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<void> {
    const stale = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :fromProjectId', { fromProjectId })
      .andWhere('m.actionDate >= :rangeStart', { rangeStart })
      .andWhere('m.actionDate <= :rangeEnd', { rangeEnd })
      .getMany();

    if (stale.length === 0) {
      return;
    }

    await this.mobilizationRepository.remove(stale);
  }

  /**
   * When a stint start moves later on the same project (e.g. import changes
   * Project A from Jul 1 → Jul 2), drop superseded start rows and grid cells.
   */
  private async cleanupPriorSameProjectMobilizationsBeforeStart(
    employeeId: number,
    projectId: number,
    newStartDateStr: string,
    _updatedBy: number,
  ): Promise<void> {
    const month = newStartDateStr.slice(0, 7);
    const { start: monthStart } = getMonthDateRange(month);

    const priorStarts = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :projectId', { projectId })
      .andWhere('m.actionDate >= :monthStart', { monthStart })
      .andWhere('m.actionDate < :newStartDate', { newStartDate: newStartDateStr })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.jobStatus IN (:...startStatuses)', {
        startStatuses: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      })
      .getMany();

    if (priorStarts.length > 0) {
      await this.mobilizationRepository.remove(priorStarts);
      this.logger.log(
        `Removed ${priorStarts.length} superseded mobilization start(s) for employee ${employeeId} ` +
          `on project ${projectId} before ${newStartDateStr}`,
      );
    }

    await this.timesheetsService.clearProjectTimesheetEntriesBeforeDate(
      employeeId,
      projectId,
      month,
      newStartDateStr,
    );
  }

  /** Remove stale mobilizations left on the old project after a transfer. */
  private async cleanupMobilizationsOnOldProjectAfterTransfer(
    employeeId: number,
    fromProjectId: number,
    toProjectId: number,
    transferDateStr: string,
  ): Promise<void> {
    const staleOnOldProject = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :fromProjectId', { fromProjectId })
      .andWhere('m.actionDate >= :transferDate', { transferDate: transferDateStr })
      .getMany();

    if (staleOnOldProject.length === 0) {
      return;
    }

    await this.mobilizationRepository.remove(staleOnOldProject);
    this.logger.log(
      `Removed ${staleOnOldProject.length} stale mobilization(s) for employee ${employeeId} ` +
        `on project ${fromProjectId} on/after ${transferDateStr} (transferred to ${toProjectId})`,
    );
  }

  /** Project the employee was on immediately before a mid-month transfer. */
  private async resolvePriorProjectForTransfer(
    employeeId: number,
    actionDateStr: string,
    newProjectId: number | null,
  ): Promise<number | null> {
    if (!newProjectId) {
      return null;
    }

    const fromSameMonthEntries =
      await this.timesheetsService.findPrimarySourceProjectForTransfer(
        employeeId,
        newProjectId,
        actionDateStr,
      );
    if (fromSameMonthEntries) {
      return fromSameMonthEntries;
    }

    const dayBeforeDate = parseDateOnly(actionDateStr);
    dayBeforeDate.setUTCDate(dayBeforeDate.getUTCDate() - 1);
    const dayBefore = formatDateOnly(dayBeforeDate);

    const mobs = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(dayBefore) as any,
      },
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    if (mobs.length === 0) {
      return null;
    }

    const effective = getEffectiveMobilizationForDate(mobs, dayBefore);
    if (
      effective?.projectId &&
      effective.mobStatus === MobStatus.MOBILIZED &&
      effective.projectId !== newProjectId
    ) {
      return effective.projectId;
    }

    return null;
  }

  /**
   * Move mobilization rows still pointing at the old project on/after the transfer
   * date so day-specific statuses (sick leave, absent, etc.) follow the employee.
   */
  private async reassignMobilizationsOnProjectTransfer(
    employeeId: number,
    transferDateStr: string,
    fromProjectId: number,
    toProjectId: number,
    updatedBy: number,
    rangeEndCap?: string,
  ): Promise<number> {
    const rangeEnd = await this.timesheetsService.resolveTransferRangeEnd(
      employeeId,
      toProjectId,
      transferDateStr,
      rangeEndCap,
    );

    const staleMobs = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.projectId = :fromProjectId', { fromProjectId })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .andWhere('m.actionDate >= :transferDate', { transferDate: transferDateStr })
      .andWhere('m.actionDate <= :rangeEnd', { rangeEnd })
      .getMany();

    let reassigned = 0;
    for (const staleMob of staleMobs) {
      staleMob.projectId = toProjectId;
      staleMob.updatedBy = updatedBy;
      await this.mobilizationRepository.save(staleMob);
      reassigned++;
    }

    if (reassigned > 0) {
      this.logger.log(
        `Reassigned ${reassigned} mobilization(s) for employee ${employeeId} ` +
          `from project ${fromProjectId} to ${toProjectId} on/after ${transferDateStr}`,
      );
    }

    return reassigned;
  }

  /**
   * When a mobilization is created/updated, delete any auto-synced mob records
   * for the same employee on DIFFERENT projects that have dates >= this mobilization's date.
   * This handles backdated transfers: e.g. employee was on project A with auto-synced mobs
   * for April 12, 15, 20 — then user creates a mobilization to project B on April 10 —
   * those stale auto-synced mobs on project A must be removed.
   */
  /**
   * When annual leave starts, remove stale timesheet-sync rows on later dates
   * (e.g. saved "active" days that would otherwise end the leave from day 2 onward).
   */
  private async cleanupFutureAutoSyncedMobsAfterLeave(
    employeeId: number,
    leaveStartDate: string,
  ): Promise<void> {
    try {
      const deleted = await this.mobilizationRepository
        .createQueryBuilder()
        .delete()
        .from(Mobilization)
        .where('employeeId = :employeeId', { employeeId })
        .andWhere('actionDate > :leaveStartDate', { leaveStartDate })
        .andWhere('notes LIKE :pattern', {
          pattern: 'Auto-synced from timesheet%',
        })
        .execute();

      if (deleted.affected && deleted.affected > 0) {
        this.logger.log(
          `Removed ${deleted.affected} future auto-synced mobilization(s) after annual leave ` +
            `for employee ${employeeId} from ${leaveStartDate}`,
        );
      }
    } catch (error) {
      this.logger.error(
         //@ts-ignore
        `Failed to cleanup future auto-synced mobs after leave for employee ${employeeId}: ${error.message}`,
      );
    }
  }

  private async cleanupConflictingAutoSyncedMobs(
    employeeId: number,
    projectId: number | null,
    actionDate: string,
  ): Promise<void> {
    try {
      if (!projectId) return;

      const deleted = await this.mobilizationRepository
        .createQueryBuilder()
        .delete()
        .from(Mobilization)
        .where('employeeId = :employeeId', { employeeId })
        .andWhere('projectId != :projectId', { projectId })
        .andWhere('actionDate >= :actionDate', { actionDate })
        .andWhere('notes LIKE :pattern', {
          pattern: 'Auto-synced from timesheet%',
        })
        .execute();

      if (deleted.affected && deleted.affected > 0) {
        this.logger.log(
          `Cleaned up ${deleted.affected} conflicting auto-synced mobilization(s) ` +
            `for employee ${employeeId} on/after ${actionDate}`,
        );
      }
    } catch (error) {
      this.logger.error(
         //@ts-ignore
        `Failed to cleanup conflicting auto-synced mobs for employee ${employeeId}: ${error.message}`,
      );
    }
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
