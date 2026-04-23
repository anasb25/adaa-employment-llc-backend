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
  compareDateOnly,
} from '../../common/utils/date.util';
import {
  DailyUtilizationReport,
  ClientUtilization,
  ProjectUtilization,
  TradeUtilization,
} from './dto/daily-utilization.dto';

/** Virtual project for the "Idle Employees" accordion (no real project row) */
export const IDLE_PROJECT_VIRTUAL = {
  id: 0,
  name: 'Idle Employees',
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

  /**
   * Get monthly project timesheet with carry-forward logic
   */
  async getMonthlyProjectTimesheet(
    projectId: number,
    month: string, // Format: YYYY-MM
  ): Promise<MonthlyProjectTimesheetData> {
    // Parse month
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // Last day of month
    const daysInMonth = endDate.getDate();
    const endDateStr = formatDateOnly(endDate);

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

    // Get all mobilizations for this project (to find which employees belong here)
    const mobilizations = await this.mobilizationRepository.find({
      where: {
        projectId: project.id,
        mobStatus: MobStatus.MOBILIZED,
        actionDate: LessThanOrEqual(endDateStr) as any,
      },
      relations: ['employee', 'mobilizedTrade'],
      order: {
        employee: { name: 'ASC' },
      },
    });

    // Group by employee and get latest mobilization for each
    const employeeMap = new Map<number, any>();
    for (const mob of mobilizations) {
      const existing = employeeMap.get(mob.employeeId);
      if (
        !existing ||
        new Date(mob.actionDate) > new Date(existing.actionDate)
      ) {
        employeeMap.set(mob.employeeId, mob);
      }
    }

    const employeeIds = Array.from(employeeMap.keys());

    // ---- BATCH: Fetch ALL mobilizations for all employees at once ----
    const allEmployeeMobilizations =
      employeeIds.length > 0
        ? await this.mobilizationRepository
            .createQueryBuilder('mob')
            .leftJoinAndSelect('mob.mobilizedTrade', 'mobilizedTrade')
            .leftJoinAndSelect('mob.project', 'project')
            .where('mob.employeeId IN (:...employeeIds)', { employeeIds })
            .andWhere('mob.actionDate <= :endDate', { endDate: endDateStr })
            .andWhere('mob.deletedAt IS NULL')
            .orderBy('mob.actionDate', 'DESC')
            .addOrderBy('mob.createdAt', 'DESC')
            .getMany()
        : [];

    // Group mobilizations by employeeId for fast lookup
    const mobilizationsByEmployee = new Map<number, Mobilization[]>();
    for (const mob of allEmployeeMobilizations) {
      let list = mobilizationsByEmployee.get(mob.employeeId);
      if (!list) {
        list = [];
        mobilizationsByEmployee.set(mob.employeeId, list);
      }
      list.push(mob);
    }

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

    // Pre-compute day-of-week names for each day in the month (avoids repeated Date operations)
    const dayInfo: Array<{
      dateStr: string;
      dayOfWeekName: string;
      day: number;
    }> = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const currentDate = parseDateOnly(dateStr);
      const dayOfWeekName = currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayInfo.push({ dateStr, dayOfWeekName, day });
    }

    const employees: any[] = [];
    let srNo = 1;

    for (const [employeeId, latestMob] of employeeMap.entries()) {
      // Use pre-fetched mobilizations for this employee
      const employeeMobilizations =
        mobilizationsByEmployee.get(employeeId) || [];

      // Build daily hours
      const dailyHours: any[] = [];

      // Track whether this employee has been demobilized from this project.
      // Once demobilized, all subsequent days in the month show as "-" (no entry).
      let demobilizedFromProject = false;

      for (const { dateStr, dayOfWeekName, day } of dayInfo) {
        // If already demobilized in a previous day this month, skip remaining days
        if (demobilizedFromProject) {
          continue;
        }

        // Find effective mobilization for this date with smart carry-forward logic
        const effectiveMob = this.getEffectiveMobilizationForDate(
          employeeMobilizations,
          dateStr,
        );

        // Check if there's an existing entry (using timezone-neutral comparison)
        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId && formatDateOnly(e.date) === dateStr,
        );

        // Pre-compute: is this the exact date of a mobilization/demobilization record?
        const effectiveMobDateStr = effectiveMob
          ? formatDateOnly(effectiveMob.actionDate)
          : null;
        const isActualMobilizationForThisDate = effectiveMobDateStr === dateStr;

        // Check if this is the day the employee was demobilized from THIS project.
        // mobStatus === DEMOBILIZED is the authoritative signal — the jobStatus (idle,
        // cancelled, absconded, etc.) only tells us WHY, it doesn't override the demob.
        // We must also verify projectId matches so a demobilization from a DIFFERENT
        // project doesn't incorrectly mark this project as demobilized.
        const isDemobilizationDay =
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.DEMOBILIZED &&
          effectiveMob.projectId === project.id &&
          isActualMobilizationForThisDate;

        // If demobilized today, mark the flag so all subsequent days are skipped
        if (isDemobilizationDay) {
          demobilizedFromProject = true;
          dailyHours.push({
            date: dateStr,
            day,
            hoursWorked: 0,
            jobStatus: 'demobilized',
            isOffDay: false,
            notes: existingEntry?.notes || null,
            entryId: existingEntry?.id || null,
          });
          continue;
        }

        // Employee was re-mobilized to a DIFFERENT project — they've left this one.
        // Skip this day regardless of whether old saved entries exist.
        if (
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.MOBILIZED &&
          effectiveMob.projectId !== null &&
          effectiveMob.projectId !== project.id
        ) {
          continue;
        }

        // Determine if employee should appear in timesheet for this date.
        // Business rule: idle = demobilized + no project. Idle employees must NEVER
        // appear on any project's monthly timesheet; they only show up in the
        // virtual "Idle Employees" timesheet (see getMonthlyIdleTimesheetData).
        // If a legacy record has mobStatus=MOBILIZED with jobStatus=IDLE, treat it
        // as not-on-this-project for rendering purposes.
        const isMobilizedToProject =
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.MOBILIZED &&
          effectiveMob.jobStatus !== JobStatus.IDLE &&
          effectiveMob.projectId === project.id;

        const hasSavedHours =
          existingEntry && Number(existingEntry.hoursWorked) > 0;
        const hasSavedEntry = !!existingEntry;

        // If the employee is demobilized (carried forward from earlier) and has no saved data, skip
        if (
          !isMobilizedToProject &&
          !hasSavedHours &&
          !hasSavedEntry
        ) {
          // Check if the carry-forward status is DEMOBILIZED from THIS project —
          // means they left this specific project before this date.
          // We must check projectId so a demobilization from a DIFFERENT project
          // (e.g. A102) doesn't incorrectly mark this project (e.g. DIBBA) as demobilized.
          if (
            effectiveMob &&
            effectiveMob.mobStatus === MobStatus.DEMOBILIZED &&
            effectiveMob.projectId === project.id
          ) {
            demobilizedFromProject = true;
          }
          continue;
        }

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
          // If user has saved a timesheet entry for this day, respect their data
          hours = Number(existingEntry.hoursWorked);
          jobStatus = existingEntry.jobStatus;
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
    // Fetch all active (non-deleted) projects
    const projects = await this.projectRepository.find({
      relations: ['client'],
      order: { name: 'ASC' },
    });

    // Process all projects concurrently
    const results = await Promise.all(
      projects.map(async (project) => {
        try {
          return await this.getMonthlyProjectTimesheet(project.id, month);
        } catch (error) {
          // If a project fails (e.g. not found), skip it
          this.logger.warn(
            `Failed to get timesheet for project ${project.id}: ${error.message}`,
          );
          return null;
        }
      }),
    );

    // Filter out any null results from failed projects
    const projectResults = results.filter(
      (r): r is MonthlyProjectTimesheetData => r !== null,
    );

    // Append "Idle Employees" timesheet at the end (one accordion for idle employee-days)
    const idleData = await this.getMonthlyIdleTimesheetData(month);
    return [...projectResults, idleData];
  }

  /**
   * Get monthly timesheet for idle employees (not on any project; job status idle).
   * One timesheet per month with projectId = null; employees are those with at least one idle day.
   */
  async getMonthlyIdleTimesheetData(
    month: string,
  ): Promise<MonthlyProjectTimesheetData> {
    const [year, monthNum] = month.split('-').map(Number);
    const endDate = new Date(year, monthNum, 0);
    const daysInMonth = endDate.getDate();
    const endDateStr = formatDateOnly(endDate);

    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId: null as any, month },
      relations: ['entries', 'entries.employee'],
    });

    const dayInfo: Array<{ dateStr: string; dayOfWeekName: string; day: number }> = [];
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
      .where('mob.actionDate <= :endDate', { endDate: endDateStr })
      .andWhere('mob.deletedAt IS NULL')
      .leftJoinAndSelect('mob.employee', 'employee')
      .leftJoinAndSelect('mob.mobilizedTrade', 'mobilizedTrade')
      .leftJoinAndSelect('mob.project', 'project')
      .orderBy('mob.employeeId')
      .addOrderBy('mob.actionDate', 'DESC')
      .addOrderBy('mob.createdAt', 'DESC')
      .getMany();

    const mobilizationsByEmployee = new Map<number, Mobilization[]>();
    for (const mob of allMobilizations) {
      if (!mob.employee) continue;
      let list = mobilizationsByEmployee.get(mob.employeeId);
      if (!list) {
        list = [];
        mobilizationsByEmployee.set(mob.employeeId, list);
      }
      list.push(mob);
    }

    const employees: any[] = [];
    let srNo = 1;

    for (const [employeeId, employeeMobilizations] of mobilizationsByEmployee) {
      const dailyHours: any[] = [];
      const latestMob = employeeMobilizations[0];
      const employee = latestMob.employee;
      const trade = latestMob.mobilizedTrade?.skill || '';
      const skillId = latestMob.mobilizedTradeId;

      for (const { dateStr, day } of dayInfo) {
        const effectiveMob = this.getEffectiveMobilizationForDate(
          employeeMobilizations,
          dateStr,
        );

        const isIdleDay =
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.DEMOBILIZED &&
          effectiveMob.jobStatus === JobStatus.IDLE;

        if (!isIdleDay) continue;

        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId && formatDateOnly(e.date) === dateStr,
        );

        const hours = existingEntry
          ? Number(existingEntry.hoursWorked)
          : this.getDefaultHoursForStatus(JobStatus.IDLE);
        const jobStatus = existingEntry?.jobStatus ?? JobStatus.IDLE;

        dailyHours.push({
          date: dateStr,
          day,
          hoursWorked: hours,
          jobStatus,
          isOffDay: false,
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
   * Get effective mobilization for a specific date with smart carry-forward logic
   * Temporary statuses (absent, sick_leave, casual_leave) don't carry forward
   */
  private getEffectiveMobilizationForDate(
    employeeMobilizations: Mobilization[],
    dateStr: string,
  ): Mobilization | undefined {
    // Find all mobilizations up to and including this date (using timezone-neutral comparison)
    const mobilizationsUpToDate = employeeMobilizations.filter((m) => {
      const mobDateStr = formatDateOnly(m.actionDate);
      return mobDateStr <= dateStr;
    });

    if (mobilizationsUpToDate.length === 0) {
      return undefined;
    }

    // Get the most recent mobilization
    const latestMob = mobilizationsUpToDate[0]; // Already sorted by actionDate DESC
    const latestMobDateStr = formatDateOnly(latestMob.actionDate);

    // List of temporary one-day statuses that should not carry forward
    const temporaryStatuses = [
      'absent',
      'sick_leave',
      'casual_leave',
      'urgent_leave',
    ];

    // If the latest mobilization is:
    // 1. On the exact date we're looking at -> use it
    // 2. Before the date AND is a temporary status -> look for the status before it
    // 3. Before the date AND is NOT a temporary status -> carry it forward

    if (latestMobDateStr === dateStr) {
      // Exact match - use this status
      return latestMob;
    }

    // Latest mobilization is before the date we're checking
    if (temporaryStatuses.includes(latestMob.jobStatus)) {
      // It's a temporary status - find the non-temporary status before it
      const nonTemporaryMob = mobilizationsUpToDate.find(
        (m, index) => index > 0 && !temporaryStatuses.includes(m.jobStatus), // Skip first (latest) as it's temporary
      );

      if (nonTemporaryMob) {
        // Return the non-temporary status but keep the project/trade from latest
        return {
          ...latestMob,
          jobStatus: nonTemporaryMob.jobStatus,
        };
      }

      // If no non-temporary status found before, default to 'active'
      return {
        ...latestMob,
        jobStatus: JobStatus.ACTIVE,
      };
    }

    // Latest mobilization is a permanent status - carry it forward
    return latestMob;
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
   * Create or get a timesheet. When projectId is null/undefined, returns the "idle employees" timesheet for the month.
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

    const savedEntries: TimesheetEntry[] = [];

    for (const entryDto of saveEntriesDto.entries) {
      // Parse date as timezone-neutral
      const entryDate = parseDateOnly(entryDto.date);

      // Check if entry exists (date is now a string)
      const dateString = formatDateOnly(entryDate);
      const existingEntry = await this.entryRepository.findOne({
        where: {
          timesheetId,
          employeeId: entryDto.employeeId,
          date: dateString as any, // TypeORM will handle the transformer
        },
      });

      let entry: TimesheetEntry;
      if (existingEntry) {
        existingEntry.hoursWorked = entryDto.hoursWorked;
        existingEntry.jobStatus = entryDto.jobStatus;
        existingEntry.notes = entryDto.notes || null;
        existingEntry.tradeInSiteId = entryDto.tradeInSiteId || null;
        existingEntry.updatedBy = updatedBy;
        entry = existingEntry;
      } else {
        entry = this.entryRepository.create({
          timesheetId,
          employeeId: entryDto.employeeId,
          date: dateString as any,
          hoursWorked: entryDto.hoursWorked,
          jobStatus: entryDto.jobStatus,
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
      await this.syncMobilizationFromTimesheetEntry(
        savedEntry,
        timesheet.projectId ?? null,
        updatedBy,
      );
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
  async removeEntryUseMobilization(entryId: number): Promise<{ message: string }> {
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
  async syncTimesheetFromMobilization(employeeId: number, date: string): Promise<void> {
    const entries = await this.entryRepository.find({
      where: { employeeId, date: date as any },
      relations: ['timesheet'],
    });

    for (const entry of entries) {
      const status = entry.timesheet?.status;
      if (status === TimesheetStatus.SUBMITTED || status === TimesheetStatus.APPROVED) {
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
   * When approving, annual leave days are deducted from each employee's annual_leave_balance
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

    // When approving, deduct annual leave days from each employee's balance
    if (approveDto.status === TimesheetStatus.APPROVED) {
      await this.deductAnnualLeaveFromApprovedTimesheet(id);
    }

    return savedTimesheet;
  }

  /**
   * Deduct annual leave days from employee balances for an approved timesheet
   */
  private async deductAnnualLeaveFromApprovedTimesheet(
    timesheetId: number,
  ): Promise<void> {
    const entries = await this.entryRepository.find({
      where: {
        timesheetId,
        jobStatus: 'annual_leave' as any,
      },
    });

    // Group by employeeId, count days (each entry = 1 day)
    const daysByEmployee = new Map<number, number>();
    for (const e of entries) {
      const count = daysByEmployee.get(e.employeeId) ?? 0;
      daysByEmployee.set(e.employeeId, count + 1);
    }

    for (const [employeeId, daysToDeduct] of daysByEmployee) {
      const employee = await this.employeeRepository.findOne({
        where: { id: employeeId },
      });
      if (!employee) continue;

      const currentBalance = Number(employee.annual_leave_balance ?? 0);
      const newBalance = Math.max(0, currentBalance - daysToDeduct);
      employee.annual_leave_balance = newBalance;
      await this.employeeRepository.save(employee);
      this.logger.log(
        `Deducted ${daysToDeduct} annual leave day(s) from employee ${employeeId}: balance ${currentBalance} -> ${newBalance}`,
      );
    }
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
      .andWhere('m.deletedAt IS NULL')
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
      const effectiveMob = this.getEffectiveMobilizationForDate(
        employeeMobilizations,
        date,
      );
      if (
        effectiveMob &&
        effectiveMob.mobStatus === MobStatus.MOBILIZED &&
        effectiveMob.project !== null
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
