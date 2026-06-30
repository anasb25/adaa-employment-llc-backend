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
import { SpecialDaysService } from '../special-days/special-days.service';
import { SpecialDayType } from '../special-days/entities/special-day.entity';
import { parseDateOnly, formatDateOnly, compareDateOnly } from '../../common/utils/date.util';
import { TimesheetsService } from '../timesheets/timesheets.service';

@Injectable()
export class MobilizationsService {
  private readonly logger = new Logger(MobilizationsService.name);

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
    await this.autoSyncTimesheet(saved.employeeId, saved.actionDate);

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
      await this.autoSyncTimesheet(mob.employeeId, mob.actionDate);
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
          effectiveData.push(effective);
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

    // Apply smart carry-forward logic for each employee
    const effectiveMobilizations: Mobilization[] = [];

    for (const [
      employeeId,
      mobilizations,
    ] of employeeMobilizationsMap.entries()) {
      const effective = await this.applySmartCarryForward(mobilizations, date);
      if (effective) {
        effectiveMobilizations.push(effective);
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
  private async applySmartCarryForward(
    mobilizations: Mobilization[],
    targetDate: Date,
  ): Promise<Mobilization | null> {
    if (mobilizations.length === 0) {
      return null;
    }

    const targetDateStr = formatDateOnly(targetDate);
    const baseEffective = this.getEffectiveMobilizationForDate(
      mobilizations,
      targetDateStr,
    );
    if (!baseEffective) {
      return null;
    }

    if (this.isPersistentUntilRemobStatus(baseEffective.jobStatus)) {
      return baseEffective;
    }

    const latestMob = baseEffective;
    const latestMobDateStr = formatDateOnly(latestMob.actionDate);

    // List of temporary one-day statuses that should not carry forward
    const temporaryStatuses: string[] = [
      'absent',
      'sick_leave',
      'casual_leave',
      'urgent_leave',
    ];

    // If the effective mobilization is on the exact date we're looking at -> use it as-is
    if (latestMobDateStr === targetDateStr) {
      return latestMob;
    }

    // We're carrying forward a status from a previous date
    // Check for special days first (higher priority than project off days).
    const specialDayRates = await this.specialDaysService.getSpecialDayRates(
      targetDate,
      latestMob.projectId ?? undefined,
    );

    if (specialDayRates.isSpecialDay) {
      if (specialDayRates.isMandatoryOff) {
        return {
          ...latestMob,
          jobStatus: JobStatus.OFF,
        };
      }

      if (
        specialDayRates.dayType === SpecialDayType.OPTIONAL_OFF ||
        specialDayRates.isDefaultOff
      ) {
        return {
          ...latestMob,
          jobStatus: JobStatus.OFF,
        };
      }
    }

    // Check if target date is a project off day
    if (
      latestMob.project?.offDays &&
      Array.isArray(latestMob.project.offDays)
    ) {
      const dayOfWeek = this.getDayOfWeek(targetDate);
      if (latestMob.project.offDays.includes(dayOfWeek)) {
        return {
          ...latestMob,
          jobStatus: JobStatus.OFF,
        };
      }
    }

    if (temporaryStatuses.includes(latestMob.jobStatus)) {
      const nonTemporaryMob = mobilizations.find(
        (m, index) => index > 0 && !temporaryStatuses.includes(m.jobStatus),
      );

      if (nonTemporaryMob) {
        return {
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus as JobStatus,
        };
      }

      return {
        ...latestMob,
        jobStatus: JobStatus.IDLE,
      };
    }

    return latestMob;
  }

  private isTerminalPermanentStatus(
    jobStatus: string | null | undefined,
  ): boolean {
    const normalized = jobStatus ? String(jobStatus).toLowerCase() : null;
    return (
      normalized === JobStatus.ABSCONDED ||
      normalized === JobStatus.CANCELLED ||
      normalized === JobStatus.RESIGNED ||
      normalized === 'absconded' ||
      normalized === 'cancelled' ||
      normalized === 'resigned'
    );
  }

  private isPersistentUntilRemobStatus(
    jobStatus: string | null | undefined,
  ): boolean {
    const normalized = jobStatus ? String(jobStatus).toLowerCase() : null;
    if (!normalized) return false;
    return (
      this.isTerminalPermanentStatus(normalized) ||
      normalized === JobStatus.ANNUAL_LEAVE ||
      normalized === JobStatus.IDLE
    );
  }

  private isAutoSyncedFromTimesheet(mob: Mobilization): boolean {
    return !!mob.notes?.startsWith('Auto-synced from timesheet');
  }

  private isExplicitRemobilization(mob: Mobilization): boolean {
    if (this.isAutoSyncedFromTimesheet(mob)) {
      return false;
    }
    const jobStatus = String(mob.jobStatus).toLowerCase();
    return (
      mob.mobStatus === MobStatus.MOBILIZED &&
      jobStatus === JobStatus.ACTIVE &&
      mob.projectId !== null
    );
  }

  private getEffectiveMobilizationForDate(
    employeeMobilizations: Mobilization[],
    dateStr: string,
  ): Mobilization | undefined {
    const mobilizationsUpToDate = employeeMobilizations.filter((m) => {
      const mobDateStr = formatDateOnly(m.actionDate);
      return mobDateStr <= dateStr;
    });

    if (mobilizationsUpToDate.length === 0) {
      return undefined;
    }

    const mostRecentRemob = mobilizationsUpToDate.find((m) =>
      this.isExplicitRemobilization(m),
    );
    const mostRecentPersistent = mobilizationsUpToDate.find((m) =>
      this.isPersistentUntilRemobStatus(m.jobStatus),
    );

    if (mostRecentPersistent) {
      const persistentDate = formatDateOnly(mostRecentPersistent.actionDate);
      const remobAfterPersistent =
        mostRecentRemob &&
        compareDateOnly(
          formatDateOnly(mostRecentRemob.actionDate),
          persistentDate,
        ) > 0;

      if (!remobAfterPersistent) {
        if (compareDateOnly(dateStr, persistentDate) >= 0) {
          return mostRecentPersistent;
        }
      } else {
        const remobDate = formatDateOnly(mostRecentRemob!.actionDate);
        if (compareDateOnly(dateStr, remobDate) >= 0) {
          const sinceRemob = mobilizationsUpToDate.filter(
            (m) =>
              compareDateOnly(formatDateOnly(m.actionDate), remobDate) >= 0,
          );
          return this.resolveCarriedMobilization(sinceRemob, dateStr);
        }
        if (compareDateOnly(dateStr, persistentDate) >= 0) {
          return mostRecentPersistent;
        }
      }
    }

    return this.resolveCarriedMobilization(mobilizationsUpToDate, dateStr);
  }

  private resolveCarriedMobilization(
    mobilizationsUpToDate: Mobilization[],
    dateStr: string,
  ): Mobilization | undefined {
    if (mobilizationsUpToDate.length === 0) {
      return undefined;
    }

    const latestMob = mobilizationsUpToDate[0];
    const latestMobDateStr = formatDateOnly(latestMob.actionDate);

    const temporaryStatuses = [
      'absent',
      'sick_leave',
      'casual_leave',
      'urgent_leave',
    ];

    if (latestMobDateStr === dateStr) {
      return latestMob;
    }

    if (temporaryStatuses.includes(latestMob.jobStatus)) {
      const nonTemporaryMob = mobilizationsUpToDate.find(
        (m, index) => index > 0 && !temporaryStatuses.includes(m.jobStatus),
      );

      if (nonTemporaryMob) {
        return {
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus as JobStatus,
        };
      }

      return {
        ...latestMob,
        jobStatus: JobStatus.ACTIVE,
      };
    }

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
    await this.autoSyncTimesheet(result.employeeId, result.actionDate);

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
        // actionDate is now a string (YYYY-MM-DD)
        const existingMobilization = await this.mobilizationRepository.findOne({
          where: {
            employeeId: employee.id,
            actionDate: mappedData.actionDate as any, // TypeORM will handle the transformer
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

          if (isDifferentFromPrevious) {
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
          mappedData.projectId,
          mappedData.actionDate,
        );
        if (mobilization.jobStatus === JobStatus.ANNUAL_LEAVE) {
          await this.cleanupFutureAutoSyncedMobsAfterLeave(
            employee.id,
            mobilization.actionDate,
          );
        }
        await this.autoSyncTimesheet(employee.id, mappedData.actionDate);

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

  private async autoSyncTimesheet(
    employeeId: number,
    actionDate: string,
  ): Promise<void> {
    try {
      await this.timesheetsService.syncTimesheetFromMobilization(
        employeeId,
        actionDate,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-sync timesheet for employee ${employeeId} on ${actionDate}: ${error.message}`,
      );
    }
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
