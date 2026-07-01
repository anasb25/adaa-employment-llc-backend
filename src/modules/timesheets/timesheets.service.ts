import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Timesheet, TimesheetStatus } from './entities/timesheet.entity';
import { TimesheetEntry } from './entities/timesheet-entry.entity';
import {
  Mobilization,
  MobStatus,
  JobStatus,
} from '../mobilizations/entities/mobilization.entity';
import {
  getEffectiveMobilizationForDate,
  isAssignedToProject,
  shouldHideFromProjectRoster,
} from '../../common/utils/effective-mobilization.util';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import {
  CreateTimesheetDto,
  SaveTimesheetEntriesDto,
} from './dto/create-timesheet.dto';
import {
  UpdateTimesheetDto,
  SubmitTimesheetDto,
  ApproveTimesheetDto,
} from './dto/update-timesheet.dto';
import { TimesheetFiltersDto } from './dto/timesheet-filters.dto';
import { SpecialDaysService } from '../special-days/special-days.service';
import { SpecialDayType } from '../special-days/entities/special-day.entity';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../common/utils/date.util';
import {
  DailyUtilizationReport,
  ClientUtilization,
  ProjectUtilization,
  TradeUtilization,
} from './dto/daily-utilization.dto';

/** Virtual project for idle & annual-leave grids (monthly timesheet projectId=null) */
export const IDLE_PROJECT_VIRTUAL = {
  id: 0,
  name: 'Idle & annual leave',
  client: { id: 0, name: '' },
} as const;

export interface MonthlyProjectTimesheetData {
  timesheet: Timesheet | null;
  project: Project | typeof IDLE_PROJECT_VIRTUAL;
  employees: Array<{
    srNo: number;
    employeeId: number;
    idNo: string;
    name: string;
    trade: string;
    skillId: number;
    dailyHours: Array<{
      date: string;
      day: number;
      hoursWorked: number;
      jobStatus: string | null;
      isOffDay: boolean;
      notes: string | null;
      entryId: number | null;
    }>;
  }>;
}

type MonthlyDayInfo = {
  dateStr: string;
  dayOfWeekName: string;
  day: number;
};

/** Shared mobilization data for one month — loaded once per bulk timesheet request. */
interface MonthlyMobilizationContext {
  endDateStr: string;
  startDate: Date;
  endDate: Date;
  dayInfo: MonthlyDayInfo[];
  mobilizationsByEmployee: Map<number, Mobilization[]>;
  /**
   * Per project: employees who were mobilized on at least one day in this month.
   * Supports mid-month transfers (same employee on multiple project sheets).
   */
  employeeIdsByProjectForMonth: Map<number, Set<number>>;
}

@Injectable()
export class TimesheetsService {
  private readonly logger = new Logger(TimesheetsService.name);

  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetEntry)
    private readonly entryRepository: Repository<TimesheetEntry>,
    @InjectRepository(Mobilization)
    private readonly mobilizationRepository: Repository<Mobilization>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    private specialDaysService: SpecialDaysService,
  ) {}

  /** Calendar Sunday for YYYY-MM-DD (UTC); matches parseDateOnly. */
  private isUtcSunday(dateStr: string): boolean {
    return parseDateOnly(dateStr).getUTCDay() === 0;
  }

  private readonly demobilizingJobStatuses = new Set([
    JobStatus.CANCELLED,
    JobStatus.ABSCONDED,
    JobStatus.ANNUAL_LEAVE,
    JobStatus.RESIGNED,
    JobStatus.IDLE,
    JobStatus.URGENT_LEAVE,
    'cancelled',
    'absconded',
    'annual_leave',
    'resigned',
    'idle',
    'urgent_leave',
  ]);

  private isDemobilizingJobStatus(jobStatus: string | null | undefined): boolean {
    if (!jobStatus) return false;
    return this.demobilizingJobStatuses.has(String(jobStatus).toLowerCase());
  }

  private normalizeJobStatus(
    jobStatus: string | null | undefined,
  ): string | null {
    if (!jobStatus) return null;
    return String(jobStatus).toLowerCase();
  }

  /** Leave + terminal statuses: hidden from project roster (idle sheet or nowhere). */
  private shouldHideFromProjectSheet(jobStatus: string | null): boolean {
    return shouldHideFromProjectRoster(jobStatus);
  }

  private shouldAppearOnIdleSheet(
    effectiveMob: Mobilization | undefined,
  ): boolean {
    if (!effectiveMob) return false;
    const jobStatus = this.normalizeJobStatus(effectiveMob.jobStatus);
    return jobStatus === JobStatus.IDLE || jobStatus === JobStatus.ANNUAL_LEAVE;
  }

  /** Load all mobilizations for a month once (avoids N×repeat per project). */
  private async buildMonthlyMobilizationContext(
    month: string,
  ): Promise<MonthlyMobilizationContext> {
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);
    const daysInMonth = endDate.getDate();
    const endDateStr = formatDateOnly(endDate);

    const dayInfo: MonthlyDayInfo[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const currentDate = parseDateOnly(dateStr);
      const dayOfWeekName = currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayInfo.push({ dateStr, dayOfWeekName, day });
    }

    const allMobilizations = await this.mobilizationRepository
      .createQueryBuilder('mob')
      .leftJoinAndSelect('mob.employee', 'employee')
      .leftJoinAndSelect('mob.mobilizedTrade', 'mobilizedTrade')
      .leftJoinAndSelect('mob.project', 'project')
      .where('mob.actionDate <= :endDate', { endDate: endDateStr })
      .orderBy('mob.actionDate', 'DESC')
      .addOrderBy('mob.createdAt', 'DESC')
      .getMany();

    const mobilizationsByEmployee = new Map<number, Mobilization[]>();
    const employeeIdsByProjectForMonth = new Map<number, Set<number>>();

    for (const mob of allMobilizations) {
      let list = mobilizationsByEmployee.get(mob.employeeId);
      if (!list) {
        list = [];
        mobilizationsByEmployee.set(mob.employeeId, list);
      }
      list.push(mob);
    }

    // One pass: for each employee × each day, record which project they were on.
    for (const [employeeId, mobs] of mobilizationsByEmployee) {
      for (const { dateStr } of dayInfo) {
        const effective = getEffectiveMobilizationForDate(mobs, dateStr);
        if (!effective?.projectId) continue;
        if (!isAssignedToProject(effective, effective.projectId)) continue;
        let onProject = employeeIdsByProjectForMonth.get(effective.projectId);
        if (!onProject) {
          onProject = new Set();
          employeeIdsByProjectForMonth.set(effective.projectId, onProject);
        }
        onProject.add(employeeId);
      }
    }

    return {
      endDateStr,
      startDate,
      endDate,
      dayInfo,
      mobilizationsByEmployee,
      employeeIdsByProjectForMonth,
    };
  }

  /**
   * Get monthly project timesheet with carry-forward logic
   */
  async getMonthlyProjectTimesheet(
    projectId: number,
    month: string, // Format: YYYY-MM
    sharedContext?: MonthlyMobilizationContext,
  ): Promise<MonthlyProjectTimesheetData> {
    const ctx =
      sharedContext ?? (await this.buildMonthlyMobilizationContext(month));
    const { endDateStr, startDate, endDate, dayInfo, mobilizationsByEmployee, employeeIdsByProjectForMonth } =
      ctx;

    // Get project
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['client'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get or create timesheet
    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
      relations: ['entries', 'entries.employee'],
    });

    // Employees who worked on this project on at least one day this month
    // (includes mid-month transfers to/from other projects).
    const employeeIdsForProject =
      employeeIdsByProjectForMonth.get(project.id) ?? new Set<number>();

    const pickRepresentativeMob = (
      mobs: Mobilization[],
      pid: number,
    ): Mobilization | undefined => {
      if (mobs.length === 0) return undefined;
      return mobs.find((m) => m.projectId === pid) ?? mobs[0];
    };

    // ---- BATCH: Pre-fetch special day rates for the entire month ----
    // Pass projectId so any special day disabled for this project (via
    // ProjectSpecialDayRate.isEnabled=false) is excluded from the map and
    // does not force job-status / billing rules on this project.
    const specialDayRatesMap =
      await this.specialDaysService.getSpecialDayRatesForRange(
        startDate,
        endDate,
        project.id,
      );

    const employees: any[] = [];
    let srNo = 1;

    for (const employeeId of employeeIdsForProject) {
      const employeeMobilizations =
        mobilizationsByEmployee.get(employeeId) || [];
      const latestMob = pickRepresentativeMob(
        employeeMobilizations,
        project.id,
      );
      if (!latestMob?.employee) {
        continue;
      }

      // Build daily hours — one cell per day this employee was mobilized on this project.
      const dailyHours: any[] = [];

      for (const { dateStr, dayOfWeekName, day } of dayInfo) {
        const effectiveMob = getEffectiveMobilizationForDate(
          employeeMobilizations,
          dateStr,
        );

        const carriedStatus = this.normalizeJobStatus(effectiveMob?.jobStatus);

        // Only show days mobilized to THIS project (mid-month transfers handled per day).
        if (!isAssignedToProject(effectiveMob, project.id)) {
          continue;
        }

        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId && formatDateOnly(e.date) === dateStr,
        );

        const effectiveMobDateStr = effectiveMob
          ? formatDateOnly(effectiveMob.actionDate)
          : null;
        const isActualMobilizationForThisDate = effectiveMobDateStr === dateStr;

        // Use pre-fetched special day rates (no DB query per day)
        const specialDayRates = specialDayRatesMap.get(dateStr) || {
          isSpecialDay: false,
          specialDay: null,
          clientRateMultiplier: 1.0,
          employeeAdditionalAmount: 0,
          isDefaultOff: false,
          isMandatoryOff: false,
          dayType: null,
        };

        // Check if this day is a project off day
        const isProjectOffDay =
          project.offDays &&
          Array.isArray(project.offDays) &&
          project.offDays.includes(dayOfWeekName);

        let hours: number;
        let jobStatus: string;

        if (existingEntry) {
          hours = Number(existingEntry.hoursWorked);
          jobStatus = carriedStatus ?? existingEntry.jobStatus;
        } else if (isActualMobilizationForThisDate) {
          // There's an actual mobilization record for this specific date
          hours = this.getDefaultHoursForStatus(effectiveMob!.jobStatus);
          jobStatus = effectiveMob!.jobStatus;
        } else if (
          specialDayRates.isSpecialDay &&
          specialDayRates.isMandatoryOff
        ) {
          hours = 0;
          jobStatus = JobStatus.OFF;
        } else if (
          specialDayRates.isSpecialDay &&
          (specialDayRates.dayType === SpecialDayType.OPTIONAL_OFF ||
            specialDayRates.isDefaultOff)
        ) {
          hours = 0;
          jobStatus = JobStatus.OFF;
        } else if (isProjectOffDay) {
          hours = 0;
          jobStatus = JobStatus.OFF;
        } else if (effectiveMob) {
          hours = this.getDefaultHoursForStatus(effectiveMob.jobStatus);
          jobStatus = effectiveMob.jobStatus;
        } else {
          continue;
        }

        dailyHours.push({
          date: dateStr,
          day,
          hoursWorked: hours,
          jobStatus: jobStatus,
          isOffDay: isProjectOffDay,
          notes: existingEntry?.notes || null,
          entryId: existingEntry?.id || null,
        });
      }

      // Include any employee who has at least one day of data during the month,
      // whether they are currently mobilized or were demobilized mid-month.
      if (dailyHours.length > 0) {
        employees.push({
          srNo: srNo++,
          employeeId: latestMob.employee.id,
          idNo: latestMob.employee.adaa_emp_code,
          name: latestMob.employee.name,
          trade: latestMob.mobilizedTrade?.skill || '',
          skillId: latestMob.mobilizedTradeId,
          dailyHours,
        });
      }
    }

    return {
      timesheet: timesheet || null,
      project,
      employees,
    };
  }

  /**
   * Get monthly timesheets for ALL projects in a single call.
   * Fetches all active projects and processes them concurrently.
   */
  async getAllProjectTimesheets(
    month: string,
  ): Promise<MonthlyProjectTimesheetData[]> {
    const projects = await this.projectRepository.find({
      relations: ['client'],
      order: { name: 'ASC' },
    });

    const sharedContext = await this.buildMonthlyMobilizationContext(month);

    const results = await Promise.all(
      projects.map(async (project) => {
        try {
          return await this.getMonthlyProjectTimesheet(
            project.id,
            month,
            sharedContext,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to get timesheet for project ${project.id}: ${error.message}`,
          );
          return null;
        }
      }),
    );

    const projectResults = results.filter(
      (r): r is MonthlyProjectTimesheetData => r !== null,
    );

    const idleData = await this.getMonthlyIdleTimesheetData(month, sharedContext);
    return [...projectResults, idleData];
  }

  /**
   * Monthly timesheet with projectId = null: idle employees and demobilized annual-leave days.
   * Includes anyone with at least one idle day OR one annual_leave day carried from mobilizations.
   * Needed so approve flow can deduct annual_leave_balance from approved annual_leave entries.
   * Business rule: On this sheet, Sundays are forced off only for idle (non-leave) rows.
   * Annual leave spans include Sundays; those days remain annual_leave and sync to mobilizations.
   */
  async getMonthlyIdleTimesheetData(
    month: string,
    sharedContext?: MonthlyMobilizationContext,
  ): Promise<MonthlyProjectTimesheetData> {
    const ctx =
      sharedContext ?? (await this.buildMonthlyMobilizationContext(month));
    const { dayInfo, mobilizationsByEmployee } = ctx;

    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId: null as any, month },
      relations: ['entries', 'entries.employee'],
    });

    const employees: any[] = [];
    let srNo = 1;

    for (const [employeeId, employeeMobilizations] of mobilizationsByEmployee) {
      const dailyHours: any[] = [];
      const latestMob = employeeMobilizations[0];
      const employee = latestMob.employee;
      const trade = latestMob.mobilizedTrade?.skill || '';
      const skillId = latestMob.mobilizedTradeId;

      for (const { dateStr, day } of dayInfo) {
        const effectiveMob = getEffectiveMobilizationForDate(
          employeeMobilizations,
          dateStr,
        );

        if (!this.shouldAppearOnIdleSheet(effectiveMob)) continue;

        const carriedStatus = this.normalizeJobStatus(effectiveMob!.jobStatus)!;
        const isIdleDay = carriedStatus === JobStatus.IDLE;
        const isAnnualLeaveDay = carriedStatus === JobStatus.ANNUAL_LEAVE;

        const baselineStatus = isAnnualLeaveDay
          ? JobStatus.ANNUAL_LEAVE
          : JobStatus.IDLE;

        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId && formatDateOnly(e.date) === dateStr,
        );

        let hours = existingEntry
          ? Number(existingEntry.hoursWorked)
          : this.getDefaultHoursForStatus(baselineStatus);
        let jobStatus: string = existingEntry?.jobStatus ?? baselineStatus;

        if (isAnnualLeaveDay) {
          jobStatus = JobStatus.ANNUAL_LEAVE;
          hours = this.getDefaultHoursForStatus(JobStatus.ANNUAL_LEAVE);
        } else if (isIdleDay) {
          jobStatus = JobStatus.IDLE;
          hours = existingEntry
            ? Number(existingEntry.hoursWorked)
            : this.getDefaultHoursForStatus(JobStatus.IDLE);
        }

        let isOffDay = false;
        const isSunday = this.isUtcSunday(dateStr);

        // Idle-only Sundays forced off (legacy rule). Sundays during annual_leave stay leave.
        if (isSunday && isIdleDay) {
          hours = 0;
          jobStatus = JobStatus.OFF;
          isOffDay = true;
        }

        // Override stale persisted "off" rows when mobilization baseline is AL (e.g. old saves).
        if (isSunday && isAnnualLeaveDay) {
          jobStatus = JobStatus.ANNUAL_LEAVE;
          hours = this.getDefaultHoursForStatus(JobStatus.ANNUAL_LEAVE);
          isOffDay = false;
        }

        dailyHours.push({
          date: dateStr,
          day,
          hoursWorked: hours,
          jobStatus,
          isOffDay,
          notes: existingEntry?.notes || null,
          entryId: existingEntry?.id || null,
        });
      }

      if (dailyHours.length > 0) {
        employees.push({
          srNo: srNo++,
          employeeId: employee.id,
          idNo: employee.adaa_emp_code,
          name: employee.name,
          trade,
          skillId,
          dailyHours,
        });
      }
    }

    employees.sort((a, b) => a.name.localeCompare(b.name));
    employees.forEach((emp, idx) => {
      emp.srNo = idx + 1;
    });

    return {
      timesheet: timesheet || null,
      project: IDLE_PROJECT_VIRTUAL,
      employees,
    };
  }

  /**
   * Get default hours for a job status
   */
  private getDefaultHoursForStatus(jobStatus: string): number {
    switch (jobStatus) {
      case 'active':
      case 'notice_period':
        return 10;
      case 'annual_leave':
      case 'urgent_leave':
      case 'cancelled':
      case 'absconded':
      case 'absent':
      case 'sick_leave':
      case 'casual_leave':
      case 'resigned':
      case 'off':
        return 0;
      case 'idle':
        return 4;
      default:
        return 10;
    }
  }

  /**
   * Create or get a timesheet. When projectId is null/undefined, returns the monthly idle + annual-leave sheet.
   */
  async createOrGetTimesheet(
    createTimesheetDto: CreateTimesheetDto,
    createdBy: number,
  ): Promise<Timesheet> {
    const projectId =
      createTimesheetDto.projectId !== undefined &&
      createTimesheetDto.projectId !== null
        ? createTimesheetDto.projectId
        : null;

    let timesheet = await this.timesheetRepository.findOne({
      where:
        projectId === null
          ? { projectId: null as any, month: createTimesheetDto.month }
          : { projectId, month: createTimesheetDto.month },
    });

    if (timesheet) {
      return timesheet;
    }

    timesheet = this.timesheetRepository.create({
      projectId,
      month: createTimesheetDto.month,
      notes: createTimesheetDto.notes,
      createdBy,
    });

    return await this.timesheetRepository.save(timesheet);
  }

  /**
   * Save timesheet entries
   */
  async saveTimesheetEntries(
    timesheetId: number,
    saveEntriesDto: SaveTimesheetEntriesDto,
    updatedBy: number,
  ): Promise<TimesheetEntry[]> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id: timesheetId },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    // Allow editing of approved/rejected timesheets by resetting to draft
    if (
      timesheet.status === TimesheetStatus.APPROVED ||
      timesheet.status === TimesheetStatus.REJECTED
    ) {
      timesheet.status = TimesheetStatus.DRAFT;
      timesheet.submittedAt = null;
      timesheet.submittedBy = null;
      timesheet.approvedAt = null;
      timesheet.approvedBy = null;
      await this.timesheetRepository.save(timesheet);
    }

    // Cannot edit while in submitted state (waiting for approval)
    if (timesheet.status === TimesheetStatus.SUBMITTED) {
      throw new BadRequestException(
        'Cannot edit a timesheet that is pending approval',
      );
    }

    const isIdleTimesheet = timesheet.projectId === null;
    const savedEntries: TimesheetEntry[] = [];

    for (const entryDto of saveEntriesDto.entries) {
      // Parse date as timezone-neutral
      const entryDate = parseDateOnly(entryDto.date);

      // Check if entry exists (date is now a string)
      const dateString = formatDateOnly(entryDate);
      let hoursWorked = entryDto.hoursWorked;
      let jobStatus = entryDto.jobStatus;
      const lowerStatus =
        typeof entryDto.jobStatus === 'string'
          ? entryDto.jobStatus.toLowerCase()
          : '';
      if (
        isIdleTimesheet &&
        this.isUtcSunday(dateString) &&
        lowerStatus !== 'annual_leave'
      ) {
        hoursWorked = 0;
        jobStatus = JobStatus.OFF;
      }

      const existingEntry = await this.entryRepository.findOne({
        where: {
          timesheetId,
          employeeId: entryDto.employeeId,
          date: dateString as any, // TypeORM will handle the transformer
        },
      });

      let entry: TimesheetEntry;
      if (existingEntry) {
        existingEntry.hoursWorked = hoursWorked;
        existingEntry.jobStatus = jobStatus;
        existingEntry.notes = entryDto.notes || null;
        existingEntry.tradeInSiteId = entryDto.tradeInSiteId || null;
        existingEntry.updatedBy = updatedBy;
        entry = existingEntry;
      } else {
        entry = this.entryRepository.create({
          timesheetId,
          employeeId: entryDto.employeeId,
          date: dateString as any,
          hoursWorked,
          jobStatus,
          notes: entryDto.notes,
          tradeInSiteId: entryDto.tradeInSiteId,
          createdBy: updatedBy,
        });
      }

      const savedEntry = await this.entryRepository.save(entry);
      savedEntries.push(savedEntry);

      // Sync to mobilization when the entry's status differs from the effective
      // mobilization. The sync function only reacts to status changes (not project),
      // so saving default entries won't break carry-forward logic.
      // Idle-sheet Sundays: skip mobilization sync for forced "off", but sync annual_leave Sundays.
      const savedLower = String(savedEntry.jobStatus).toLowerCase();
      const skipIdleSundayMobSync =
        isIdleTimesheet &&
        this.isUtcSunday(dateString) &&
        savedLower !== 'annual_leave';
      if (!skipIdleSundayMobSync) {
        await this.syncMobilizationFromTimesheetEntry(
          savedEntry,
          timesheet.projectId ?? null,
          updatedBy,
        );
      }
    }

    return savedEntries;
  }

  /**
   * Sync mobilization to match this timesheet entry (use timesheet as source of truth).
   * Call this when user chooses "Sync mobilization with timesheet".
   */
  async syncMobilizationFromEntry(
    entryId: number,
    updatedBy: number,
  ): Promise<{ message: string }> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId },
      relations: ['timesheet'],
    });
    if (!entry) {
      throw new NotFoundException('Timesheet entry not found');
    }
    const timesheet = entry.timesheet;
    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }
    if (timesheet.status === TimesheetStatus.SUBMITTED) {
      throw new BadRequestException(
        'Cannot sync while timesheet is pending approval',
      );
    }
    await this.syncMobilizationFromTimesheetEntry(
      entry,
      timesheet.projectId ?? null,
      updatedBy,
    );
    return { message: 'Mobilization updated to match timesheet' };
  }

  /**
   * Remove the timesheet entry so the cell will show mobilization data (use mobilization as source of truth).
   * Call this when user chooses "Sync timesheet with mobilization".
   */
  async removeEntryUseMobilization(
    entryId: number,
  ): Promise<{ message: string }> {
    const entry = await this.entryRepository.findOne({
      where: { id: entryId },
      relations: ['timesheet'],
    });
    if (!entry) {
      throw new NotFoundException('Timesheet entry not found');
    }
    if (entry.timesheet?.status === TimesheetStatus.SUBMITTED) {
      throw new BadRequestException(
        'Cannot remove entry while timesheet is pending approval',
      );
    }
    await this.entryRepository.remove(entry);
    return { message: 'Entry removed; data will show from mobilization' };
  }

  /**
   * Auto-remove timesheet entries for an employee on a specific date so the grid
   * falls back to mobilization-derived data. Skips submitted/approved timesheets.
   * Called by MobilizationsService when a mobilization is created or updated.
   */
  async syncTimesheetFromMobilization(
    employeeId: number,
    date: string,
  ): Promise<void> {
    const entries = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.timesheet', 'timesheet')
      .where('entry.employeeId = :employeeId', { employeeId })
      .andWhere('entry.date >= :date', { date })
      .getMany();

    for (const entry of entries) {
      const status = entry.timesheet?.status;
      if (
        status === TimesheetStatus.SUBMITTED ||
        status === TimesheetStatus.APPROVED
      ) {
        continue;
      }
      await this.entryRepository.remove(entry);
    }
  }

  /**
   * Auto-sync mobilization record when timesheet entry status changes
   * Creates a new mobilization record if the job status differs from the current mobilization
   * Automatically demobilizes employee if status is: cancelled, absconded, annual_leave, resigned, or idle
   */
  private async syncMobilizationFromTimesheetEntry(
    entry: TimesheetEntry,
    projectId: number | null,
    createdBy: number,
  ): Promise<void> {
    try {
      // entry.date is now a string (YYYY-MM-DD) thanks to DateOnlyTransformer
      const dateStr = entry.date;
      if (
        projectId === null &&
        this.isUtcSunday(dateStr) &&
        String(entry.jobStatus).toLowerCase() !== 'annual_leave'
      ) {
        return;
      }

      const entryDate = parseDateOnly(dateStr);

      // Define statuses that should trigger automatic demobilization
      const demobilizingStatuses = [
        'cancelled',
        'absconded',
        'annual_leave',
        'resigned',
        'idle',
      ];

      // Determine if this status should demobilize the employee
      const shouldDemobilize = demobilizingStatuses.includes(
        entry.jobStatus.toLowerCase(),
      );

      // Get current effective mobilization for this employee on this date
      // actionDate is now a string, so we use string comparison
      const currentMobilizations = await this.mobilizationRepository.find({
        where: {
          employeeId: entry.employeeId,
          actionDate: LessThanOrEqual(dateStr) as any,
        },
        relations: ['mobilizedTrade'],
        order: { actionDate: 'DESC', createdAt: 'DESC' },
      });

      if (currentMobilizations.length === 0) {
        this.logger.warn(
          `No mobilization found for employee ${entry.employeeId} on date ${dateStr}. Cannot auto-sync.`,
        );
        return;
      }

      const currentMob = currentMobilizations[0];

      // Don't sync if the employee's effective mobilization is on a DIFFERENT project.
      // This prevents stale timesheet saves from creating conflicting mob records
      // after the employee has been transferred to another project.
      if (
        currentMob.mobStatus === MobStatus.MOBILIZED &&
        currentMob.projectId !== null &&
        currentMob.projectId !== projectId
      ) {
        this.logger.log(
          `Skipping sync for employee ${entry.employeeId} on ${dateStr}: ` +
            `employee is on project ${currentMob.projectId}, not timesheet project ${projectId}`,
        );
        return;
      }

      // Check if there's already a mobilization record for this exact date (using timezone-neutral comparison)
      const exactDateMob = currentMobilizations.find((m) => {
        const mobDateStr = formatDateOnly(m.actionDate);
        return mobDateStr === dateStr;
      });

      // Only sync when the job STATUS actually changed — not project.
      // Project is determined by mobilization data, not by which timesheet the entry lives in.
      // This prevents default entries from creating spurious mobilization records.
      if (exactDateMob) {
        const statusChanged = exactDateMob.jobStatus !== entry.jobStatus;
        const mobStatusChanged =
          shouldDemobilize && exactDateMob.mobStatus !== MobStatus.DEMOBILIZED;

        if (statusChanged || mobStatusChanged) {
          exactDateMob.jobStatus = entry.jobStatus as JobStatus;

          if (shouldDemobilize) {
            exactDateMob.mobStatus = MobStatus.DEMOBILIZED;
            exactDateMob.projectId = null;
          }

          exactDateMob.updatedBy = createdBy;
          await this.mobilizationRepository.save(exactDateMob);

          const mobStatusInfo = shouldDemobilize ? ' (DEMOBILIZED)' : '';
          this.logger.log(
            `Updated mobilization for employee ${entry.employeeId} on ${dateStr}: ${entry.jobStatus}${mobStatusInfo}`,
          );
        }
      } else {
        // No mobilization for this exact date - check if we need to create one
        const statusDiffers = currentMob.jobStatus !== entry.jobStatus;
        const needsDemobilization =
          shouldDemobilize && currentMob.mobStatus !== MobStatus.DEMOBILIZED;

        if (statusDiffers || needsDemobilization) {
          const newMob = this.mobilizationRepository.create({
            employeeId: entry.employeeId,
            mobilizedTradeId: currentMob.mobilizedTradeId,
            projectId: shouldDemobilize ? null : currentMob.projectId,
            mobStatus: shouldDemobilize
              ? MobStatus.DEMOBILIZED
              : currentMob.mobStatus,
            jobStatus: entry.jobStatus as JobStatus,
            actionDate: dateStr as any,
            notes:
              `Auto-synced from timesheet${shouldDemobilize ? ' - Auto-demobilized' : ''}: ${entry.notes || ''}`.trim(),
            createdBy,
          });

          await this.mobilizationRepository.save(newMob);

          const mobStatusInfo = shouldDemobilize ? ' (DEMOBILIZED)' : '';
          this.logger.log(
            `Created mobilization for employee ${entry.employeeId} on ${dateStr}: ${entry.jobStatus}${mobStatusInfo}`,
          );
        }
      }
    } catch (error) {
      // Log error but don't fail the timesheet save
      this.logger.error(
        `Failed to sync mobilization for employee ${entry.employeeId}: ${error.message}`,
      );
    }
  }

  /**
   * Submit timesheet for approval
   */
  async submitTimesheet(
    id: number,
    submitDto: SubmitTimesheetDto,
    submittedBy: number,
  ): Promise<Timesheet> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status === TimesheetStatus.SUBMITTED) {
      throw new BadRequestException('Timesheet is already pending approval');
    }

    timesheet.status = TimesheetStatus.SUBMITTED;
    timesheet.submittedAt = new Date();
    timesheet.submittedBy = submittedBy;
    if (submitDto.notes) {
      timesheet.notes = submitDto.notes;
    }

    return await this.timesheetRepository.save(timesheet);
  }

  /**
   * Approve or reject timesheet
   * When approving, annual leave is reconciled: prior approval deductions for this
   * sheet (see annualLeaveDeductionApplied) are credited back, then current annual_leave
   * entry counts are deducted. Safe to approve again after edits without double debit.
   */
  async approveTimesheet(
    id: number,
    approveDto: ApproveTimesheetDto,
    approvedBy: number,
  ): Promise<Timesheet> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status !== TimesheetStatus.SUBMITTED) {
      throw new BadRequestException(
        'Can only approve/reject submitted timesheets',
      );
    }

    timesheet.status = approveDto.status;
    timesheet.approvedAt = new Date();
    timesheet.approvedBy = approvedBy;
    if (approveDto.notes) {
      timesheet.notes = approveDto.notes;
    }

    const savedTimesheet = await this.timesheetRepository.save(timesheet);

    if (approveDto.status === TimesheetStatus.APPROVED) {
      await this.reconcileAnnualLeaveDeductionOnApprove(savedTimesheet.id);
    }

    return savedTimesheet;
  }

  private parseDeductionSnapshot(
    raw: Record<string, number> | null | undefined,
  ): Map<number, number> {
    const m = new Map<number, number>();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return m;
    }
    for (const [k, v] of Object.entries(raw)) {
      const employeeId = Number(k);
      const days = typeof v === 'number' ? v : Number(v);
      if (
        !Number.isFinite(employeeId) ||
        !Number.isFinite(days) ||
        days <= 0
      ) {
        continue;
      }
      m.set(employeeId, days);
    }
    return m;
  }

  /**
   * Undo last approval's AL deductions for this timesheet (from snapshot),
   * then apply deductions from current annual_leave rows; update snapshot.
   */
  private async reconcileAnnualLeaveDeductionOnApprove(
    timesheetId: number,
  ): Promise<void> {
    await this.timesheetRepository.manager.transaction(async (trx) => {
      const sheetRepo = trx.getRepository(Timesheet);
      const entryRepoTrx = trx.getRepository(TimesheetEntry);
      const empRepoTrx = trx.getRepository(Employee);

      const ts = await sheetRepo.findOne({ where: { id: timesheetId } });
      if (!ts) return;

      const prev = this.parseDeductionSnapshot(ts.annualLeaveDeductionApplied);

      const entries = await entryRepoTrx.find({
        where: {
          timesheetId,
          jobStatus: 'annual_leave' as any,
        },
      });

      const curr = new Map<number, number>();
      for (const e of entries) {
        curr.set(e.employeeId, (curr.get(e.employeeId) ?? 0) + 1);
      }

      const employeeIds = new Set<number>([...prev.keys(), ...curr.keys()]);

      for (const employeeId of employeeIds) {
        const previousDays = prev.get(employeeId) ?? 0;
        const newDays = curr.get(employeeId) ?? 0;
        const delta = previousDays - newDays;

        const employee = await empRepoTrx.findOne({ where: { id: employeeId } });
        if (!employee) continue;

        if (delta !== 0) {
          const bal = Number(employee.annual_leave_balance ?? 0);
          employee.annual_leave_balance =
            Math.round(Math.max(0, bal + delta) * 100) / 100;
          await empRepoTrx.save(employee);
          this.logger.log(
            `Annual leave reconcile (timesheet ${timesheetId}) employee ${employeeId}: prevSnap ${previousDays} -> newEntries ${newDays}; balance ${bal} → ${employee.annual_leave_balance} (${delta >= 0 ? '+' : ''}${delta})`,
          );
        }
      }

      const snap: Record<string, number> = {};
      for (const [employeeId, days] of curr) {
        snap[String(employeeId)] = days;
      }
      ts.annualLeaveDeductionApplied = curr.size === 0 ? ({}) : snap;
      await sheetRepo.save(ts);
    });
  }

  /**
   * Get all timesheets with filters
   */
  async findAll(filters?: TimesheetFiltersDto): Promise<Timesheet[]> {
    const queryBuilder = this.timesheetRepository
      .createQueryBuilder('timesheet')
      .leftJoinAndSelect('timesheet.project', 'project')
      .leftJoinAndSelect('project.client', 'client');

    if (filters?.projectId) {
      queryBuilder.andWhere('timesheet.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }

    if (filters?.month) {
      queryBuilder.andWhere('timesheet.month = :month', {
        month: filters.month,
      });
    }

    if (filters?.status) {
      queryBuilder.andWhere('timesheet.status = :status', {
        status: filters.status,
      });
    }

    queryBuilder.orderBy('timesheet.month', 'DESC');

    return await queryBuilder.getMany();
  }

  /**
   * Get a single timesheet by ID
   */
  async findOne(id: number): Promise<Timesheet> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
      relations: [
        'project',
        'project.client',
        'entries',
        'entries.employee',
        'entries.tradeInSite',
      ],
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    return timesheet;
  }

  /**
   * Delete a timesheet (hard delete)
   */
  async remove(id: number, _deletedBy?: number): Promise<void> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException('Cannot delete an approved timesheet');
    }

    await this.timesheetRepository.delete(id);
  }

  /**
   * Get daily utilization report
   * Shows employee distribution across clients/projects/trades for a specific date
   */
  async getDailyUtilizationReport(
    date: string, // YYYY-MM-DD format
  ): Promise<DailyUtilizationReport> {
    // Get all mobilizations up to and including the target date
    const mobilizations = await this.mobilizationRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.employee', 'employee')
      .leftJoinAndSelect('m.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('m.mobilizedTrade', 'trade')
      .where('m.actionDate <= :targetDate', { targetDate: date })
      .orderBy('m.employeeId', 'ASC')
      .addOrderBy('m.actionDate', 'DESC')
      .addOrderBy('m.createdAt', 'DESC')
      .getMany();

    // Group mobilizations by employee (list is already sorted DESC per employee)
    const mobilizationsByEmployee = new Map<number, Mobilization[]>();
    for (const mob of mobilizations) {
      let list = mobilizationsByEmployee.get(mob.employeeId);
      if (!list) {
        list = [];
        mobilizationsByEmployee.set(mob.employeeId, list);
      }
      list.push(mob);
    }

    // For each employee apply carry-forward logic so that temporary one-day statuses
    // (absent, sick_leave, casual_leave, urgent_leave) do not incorrectly exclude them.
    // Count as mobilized if the effective status is MOBILIZED and the employee is on a project —
    // matching the same logic used by the Daily Mobilization Management page.
    const activeMobilizations: Mobilization[] = [];
    for (const [, employeeMobilizations] of mobilizationsByEmployee) {
      const effectiveMob = getEffectiveMobilizationForDate(
        employeeMobilizations,
        date,
      );
      if (
        effectiveMob?.projectId !== null &&
        effectiveMob?.projectId !== undefined &&
        isAssignedToProject(effectiveMob, effectiveMob.projectId)
      ) {
        activeMobilizations.push(effectiveMob);
      }
    }

    // Group by client -> project -> trade
    const clientMap = new Map<
      number,
      {
        clientId: number;
        clientName: string;
        projects: Map<
          number,
          {
            projectId: number;
            projectName: string;
            location: string | null;
            fat: string | null;
            trades: Map<string, number>;
          }
        >;
      }
    >();

    for (const mob of activeMobilizations) {
      if (!mob.project) continue;
      const clientId = mob.project.clientId;
      const clientName = mob.project.client?.name || 'Unknown Client';
      const projectId = mob.project.id;
      const projectName = mob.project.name;
      const location = mob.project.location || null;
      const fat = mob.project.fat || null;
      const tradeName = mob.mobilizedTrade?.skill || 'Unknown Trade';

      // Get or create client entry
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          clientId,
          clientName,
          projects: new Map(),
        });
      }
      const client = clientMap.get(clientId)!;

      // Get or create project entry
      if (!client.projects.has(projectId)) {
        client.projects.set(projectId, {
          projectId,
          projectName,
          location,
          fat,
          trades: new Map(),
        });
      }
      const project = client.projects.get(projectId)!;

      // Increment trade count
      const currentCount = project.trades.get(tradeName) || 0;
      project.trades.set(tradeName, currentCount + 1);
    }

    // Convert to output format
    const clients: ClientUtilization[] = [];
    let totalManpower = 0;

    for (const [clientId, clientData] of clientMap) {
      const projects: ProjectUtilization[] = [];
      let clientTotal = 0;

      for (const [projectId, projectData] of clientData.projects) {
        const trades: TradeUtilization[] = [];

        for (const [tradeName, headCount] of projectData.trades) {
          trades.push({
            tradeInSite: tradeName,
            headCount,
          });
          clientTotal += headCount;
        }

        // Sort trades alphabetically
        trades.sort((a, b) => a.tradeInSite.localeCompare(b.tradeInSite));

        projects.push({
          projectId: projectData.projectId,
          projectName: projectData.projectName,
          location: projectData.location,
          fat: projectData.fat,
          trades,
        });
      }

      // Sort projects by name
      projects.sort((a, b) => a.projectName.localeCompare(b.projectName));

      clients.push({
        clientId,
        clientName: clientData.clientName,
        projects,
        total: clientTotal,
      });

      totalManpower += clientTotal;
    }

    // Sort clients by name
    clients.sort((a, b) => a.clientName.localeCompare(b.clientName));

    return {
      date,
      clients,
      totalManpower,
    };
  }
}
