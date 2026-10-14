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
  isDaySpecificJobStatus,
  shouldHideFromProjectRoster,
} from '../../common/utils/effective-mobilization.util';
import { Employee } from '../employees/entities/employee.entity';
import {
  DEFAULT_PROJECT_OFF_DAYS,
  getEffectiveProjectOffDays,
  Project,
} from '../projects/entities/project.entity';
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
import { SpecialDaysService, SpecialDayRates } from '../special-days/special-days.service';
import { SpecialDayType } from '../special-days/entities/special-day.entity';
import {
  formatDateOnly,
  getMonthDateRange,
  parseDateOnly,
  compareDateOnly,
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

/** Shared mobilization data for one month — loaded once per bulk timesheet/payroll request. */
export interface MonthlyMobilizationContext {
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

  /** Reuse mobilization context within a short window (bulk reads / payroll). */
  private readonly mobilizationContextCache = new Map<
    string,
    { ctx: MonthlyMobilizationContext; expiresAt: number }
  >();

  private static readonly MOBILIZATION_CONTEXT_TTL_MS = 90_000;

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
    if (jobStatus === JobStatus.IDLE || jobStatus === JobStatus.ANNUAL_LEAVE) {
      return true;
    }
    return (
      jobStatus === JobStatus.URGENT_LEAVE &&
      effectiveMob.mobStatus === MobStatus.DEMOBILIZED
    );
  }

  private isLeaveStatus(jobStatus: string | null | undefined): boolean {
    const normalized = this.normalizeJobStatus(jobStatus);
    return (
      normalized === JobStatus.ABSENT ||
      normalized === JobStatus.SICK_LEAVE ||
      normalized === JobStatus.CASUAL_LEAVE ||
      normalized === JobStatus.URGENT_LEAVE ||
      normalized === JobStatus.ANNUAL_LEAVE
    );
  }

  private isTimesheetEntryUserEdited(entry: TimesheetEntry): boolean {
    return (
      entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000
    );
  }

  private getDayOfWeekName(dateStr: string): string {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    return days[parseDateOnly(dateStr).getUTCDay()];
  }

  private defaultSpecialDayRates(dateStr: string): SpecialDayRates {
    return {
      isSpecialDay: false,
      specialDay: null,
      clientRateMultiplier: 1.0,
      employeeAdditionalAmount: 0,
      isDefaultOff: false,
      isMandatoryOff: false,
      dayType: null,
    };
  }

  /** Apply project/special calendar off rules to a status/hours pair. */
  private resolveCalendarAdjustedCell(
    project: Project | null,
    dateStr: string,
    jobStatus: string,
    hoursWorked: number,
    specialDayRates: SpecialDayRates = this.defaultSpecialDayRates(dateStr),
    savedEntryUserEdited = false,
  ): { jobStatus: string; hoursWorked: number } {
    const isProjectOffDay =
      project != null && this.isDateProjectOffDay(project, dateStr);
    return this.applyCalendarOffRules(
      jobStatus,
      hoursWorked,
      isProjectOffDay,
      specialDayRates,
      savedEntryUserEdited,
    );
  }

  /**
   * After mobilization sync, ensure saved rows on a project respect off days
   * (auto-materialized / shifted active rows become off with 0 hours).
   */
  async enforceProjectCalendarForEmployeeOnProject(
    employeeId: number,
    projectId: number,
    month: string,
    fromDateStr?: string,
  ): Promise<number> {
    let project = await this.projectRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      return 0;
    }
    project = await this.ensureProjectOffDaysConfigured(project);

    const { start: monthStart, end: monthEnd } = getMonthDateRange(month);
    const rangeStart =
      fromDateStr && compareDateOnly(fromDateStr, monthStart) > 0
        ? fromDateStr
        : monthStart;

    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
    });
    if (!timesheet) {
      return 0;
    }

    if (
      timesheet.status === TimesheetStatus.SUBMITTED ||
      timesheet.status === TimesheetStatus.APPROVED
    ) {
      return 0;
    }

    const mobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(monthEnd) as any,
      },
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    const specialDayRatesMap =
      await this.specialDaysService.getSpecialDayRatesForRange(
        parseDateOnly(rangeStart),
        parseDateOnly(monthEnd),
        projectId,
      );

    const entries = await this.entryRepository
      .createQueryBuilder('entry')
      .where('entry.timesheetId = :timesheetId', { timesheetId: timesheet.id })
      .andWhere('entry.employeeId = :employeeId', { employeeId })
      .andWhere('entry.date >= :rangeStart', { rangeStart })
      .andWhere('entry.date <= :monthEnd', { monthEnd })
      .getMany();

    let fixed = 0;
    for (const entry of entries) {
      const dateStr = formatDateOnly(entry.date);
      const effective = getEffectiveMobilizationForDate(mobilizations, dateStr);
      if (!isAssignedToProject(effective, projectId)) {
        continue;
      }

      const specialDayRates =
        specialDayRatesMap.get(dateStr) ?? this.defaultSpecialDayRates(dateStr);
      const isProjectOffDay = this.isDateProjectOffDay(project, dateStr);
      const adjusted = this.resolveCalendarAdjustedCell(
        project,
        dateStr,
        entry.jobStatus,
        Number(entry.hoursWorked),
        specialDayRates,
        this.isTimesheetEntryUserEdited(entry) ||
          (isProjectOffDay &&
            Number(entry.hoursWorked) > 0 &&
            Number(entry.hoursWorked) !==
              this.getDefaultHoursForStatus(JobStatus.ACTIVE)),
      );

      if (
        adjusted.jobStatus !== entry.jobStatus ||
        Number(adjusted.hoursWorked) !== Number(entry.hoursWorked)
      ) {
        entry.jobStatus = adjusted.jobStatus as any;
        entry.hoursWorked = adjusted.hoursWorked;
        await this.entryRepository.save(entry);
        fixed++;
      }
    }

    if (fixed > 0) {
      this.logger.log(
        `Enforced project calendar on ${fixed} timesheet entry/entries for employee ${employeeId} ` +
          `on project ${projectId} in ${month}`,
      );
    }

    return fixed;
  }

  private isDateProjectOffDay(project: Project, dateStr: string): boolean {
    return getEffectiveProjectOffDays(project).includes(
      this.getDayOfWeekName(dateStr),
    );
  }

  /** Persist default Sunday off when import auto-created a project without offDays. */
  private async ensureProjectOffDaysConfigured(
    project: Project,
  ): Promise<Project> {
    if (
      project.offDays &&
      Array.isArray(project.offDays) &&
      project.offDays.length > 0
    ) {
      return project;
    }
    project.offDays = [...DEFAULT_PROJECT_OFF_DAYS];
    return this.projectRepository.save(project);
  }

  /** One-time heal for projects created before offDays default existed. */
  private async backfillMissingProjectOffDays(): Promise<void> {
    const projects = await this.projectRepository
      .createQueryBuilder('project')
      .where('project.offDays IS NULL')
      .orWhere(`project.offDays = '[]'::jsonb`)
      .getMany();

    for (const project of projects) {
      project.offDays = [...DEFAULT_PROJECT_OFF_DAYS];
      await this.projectRepository.save(project);
    }
  }

  /**
   * Project off days (configured on the project) and special calendar off days
   * apply on every month for assigned workers. Default is Off with 0 hours.
   * Only a user-edited saved entry with hours > 0 means the employee worked
   * that off day (auto-materialized rows must not block Off display).
   */
  private applyCalendarOffRules(
    jobStatus: string,
    hoursWorked: number,
    isProjectOffDay: boolean,
    specialDayRates: SpecialDayRates,
    savedEntryUserEdited = false,
  ): { jobStatus: string; hoursWorked: number } {
    const isSpecialCalendarOff =
      specialDayRates.isSpecialDay &&
      (specialDayRates.isMandatoryOff ||
        specialDayRates.dayType === SpecialDayType.OPTIONAL_OFF ||
        specialDayRates.isDefaultOff);

    if (!isProjectOffDay && !isSpecialCalendarOff) {
      return { jobStatus, hoursWorked };
    }

    const status =
      this.normalizeJobStatus(jobStatus) ?? JobStatus.ACTIVE;
    const hours = Number(hoursWorked) || 0;

    if (this.isLeaveStatus(status)) {
      return { jobStatus: status, hoursWorked: hours };
    }

    if (
      status === JobStatus.CANCELLED ||
      status === JobStatus.ABSCONDED ||
      status === JobStatus.RESIGNED
    ) {
      return { jobStatus: status, hoursWorked: 0 };
    }

    if (
      savedEntryUserEdited &&
      hours > 0 &&
      (status === JobStatus.ACTIVE ||
        status === JobStatus.NOTICE_PERIOD ||
        status === JobStatus.OFF)
    ) {
      const workStatus =
        status === JobStatus.NOTICE_PERIOD
          ? JobStatus.NOTICE_PERIOD
          : JobStatus.ACTIVE;
      return { jobStatus: workStatus, hoursWorked: hours };
    }

    // Saved non-default hours on an off day (e.g. 8h) even when edit timestamp
    // was not detected — distinguishes user entry from auto-materialized 10h.
    if (
      hours > 0 &&
      (status === JobStatus.ACTIVE || status === JobStatus.NOTICE_PERIOD) &&
      hours !== this.getDefaultHoursForStatus(JobStatus.ACTIVE)
    ) {
      const workStatus =
        status === JobStatus.NOTICE_PERIOD
          ? JobStatus.NOTICE_PERIOD
          : JobStatus.ACTIVE;
      return { jobStatus: workStatus, hoursWorked: hours };
    }

    return { jobStatus: JobStatus.OFF, hoursWorked: 0 };
  }

  /**
   * Pair status with hours on the timesheet:
   * - leave WITH hours > 0 → active (hours mean the employee worked)
   * - leave WITH 0 hours → real leave (show A / SL / AL)
   * - off / terminal: keep hours as entered
   * - active / idle with 0 hours → default hours
   */
  private normalizeStatusAndHours(
    jobStatus: string | null | undefined,
    hoursWorked: number,
    preserveExplicitZero = false,
  ): { jobStatus: string; hoursWorked: number } {
    const status =
      this.normalizeJobStatus(jobStatus) ?? JobStatus.ACTIVE;
    const hours = Number(hoursWorked) || 0;

    // Working hours on a leave day = worked → treat as active.
    if (this.isLeaveStatus(status) && hours > 0) {
      return { jobStatus: JobStatus.ACTIVE, hoursWorked: hours };
    }

    if (this.isLeaveStatus(status)) {
      return { jobStatus: status, hoursWorked: 0 };
    }

    if (
      status === JobStatus.CANCELLED ||
      status === JobStatus.ABSCONDED ||
      status === JobStatus.RESIGNED
    ) {
      return { jobStatus: status, hoursWorked: 0 };
    }

    if (status === JobStatus.OFF) {
      return { jobStatus: status, hoursWorked: hours };
    }

    if (hours <= 0) {
      // Explicitly saved entries keep their 0 hours (don't inflate to default).
      // Only mobilization-derived days (no saved entry) get the default hours.
      return {
        jobStatus: status,
        hoursWorked: preserveExplicitZero
          ? 0
          : this.getDefaultHoursForStatus(status),
      };
    }

    return { jobStatus: status, hoursWorked: hours };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Fix leave/terminal rows that still have hours > 0 by setting status to active
   * (hours mean worked). Real leave stays leave with 0 hours.
   */
  async repairInconsistentStatusHours(month?: string): Promise<number> {
    const leaveStatuses = [
      JobStatus.ABSENT,
      JobStatus.SICK_LEAVE,
      JobStatus.CASUAL_LEAVE,
      JobStatus.URGENT_LEAVE,
      JobStatus.ANNUAL_LEAVE,
    ];

    const qb = this.entryRepository
      .createQueryBuilder()
      .update(TimesheetEntry)
      .set({ jobStatus: JobStatus.ACTIVE as any })
      .where('jobStatus IN (:...statuses)', { statuses: leaveStatuses })
      .andWhere('"hoursWorked" > 0');

    if (month) {
      const { start, end } = getMonthDateRange(month);
      qb.andWhere('date >= :start AND date <= :end', { start, end });
    }

    const result = await qb.execute();
    const offDayRepairs = await this.repairAutoActiveOnProjectOffDays(month);
    return (result.affected ?? 0) + offDayRepairs;
  }

  /**
   * Auto-materialized rows often save active + default hours on project off days.
   * Reset those to off/0 unless the user has edited the cell.
   */
  async repairAutoActiveOnProjectOffDays(
    month?: string,
    employeeId?: number,
  ): Promise<number> {
    const qb = this.entryRepository
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.timesheet', 'timesheet')
      .innerJoinAndSelect('timesheet.project', 'project')
      .where('timesheet.projectId IS NOT NULL')
      .andWhere('entry.jobStatus IN (:...working)', {
        working: [JobStatus.ACTIVE, JobStatus.NOTICE_PERIOD],
      })
      .andWhere('entry.hoursWorked > 0');

    if (month) {
      const { start, end } = getMonthDateRange(month);
      qb.andWhere('entry.date >= :start AND entry.date <= :end', { start, end });
    }

    if (employeeId != null) {
      qb.andWhere('entry.employeeId = :employeeId', { employeeId });
    }

    if (month) {
      const { start, end } = getMonthDateRange(month);
      qb.andWhere('entry.date >= :start AND entry.date <= :end', { start, end });
    }

    const entries = await qb.getMany();
    let repaired = 0;

    for (const entry of entries) {
      if (this.isTimesheetEntryUserEdited(entry)) {
        continue;
      }
      // Non-default hours on an off day were entered manually — do not reset.
      if (
        Number(entry.hoursWorked) !==
        this.getDefaultHoursForStatus(JobStatus.ACTIVE)
      ) {
        continue;
      }
      const project = entry.timesheet?.project;
      if (!project || !this.isDateProjectOffDay(project, entry.date)) {
        continue;
      }
      entry.jobStatus = JobStatus.OFF;
      entry.hoursWorked = 0;
      await this.entryRepository.save(entry);
      repaired++;
    }

    return repaired;
  }

  invalidateMonthlyMobilizationContextCache(month?: string): void {
    if (month) {
      this.mobilizationContextCache.delete(month);
      return;
    }
    this.mobilizationContextCache.clear();
  }

  /** Load all mobilizations for a month once (avoids N×repeat per project). */
  async buildMonthlyMobilizationContext(
    month: string,
    options?: { bypassCache?: boolean },
  ): Promise<MonthlyMobilizationContext> {
    if (!options?.bypassCache) {
      const cached = this.mobilizationContextCache.get(month);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.ctx;
      }
    }
    const [year, monthNum] = month.split('-').map(Number);
    const { start: startDateStr, end: endDateStr } = getMonthDateRange(month);
    const startDate = parseDateOnly(startDateStr);
    const endDate = parseDateOnly(endDateStr);
    const daysInMonth = endDate.getUTCDate();

    const dayInfo: MonthlyDayInfo[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeekName = this.getDayOfWeekName(dateStr);
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

    const ctx: MonthlyMobilizationContext = {
      endDateStr,
      startDate,
      endDate,
      dayInfo,
      mobilizationsByEmployee,
      employeeIdsByProjectForMonth,
    };

    this.mobilizationContextCache.set(month, {
      ctx,
      expiresAt: Date.now() + TimesheetsService.MOBILIZATION_CONTEXT_TTL_MS,
    });

    return ctx;
  }

  /**
   * Get monthly project timesheet with carry-forward logic
   */
  async getMonthlyProjectTimesheet(
    projectId: number,
    month: string, // Format: YYYY-MM
    sharedContext?: MonthlyMobilizationContext,
  ): Promise<MonthlyProjectTimesheetData> {
    // Standalone project loads also heal inconsistent rows for the month.
    if (!sharedContext) {
      await this.repairInconsistentStatusHours(month);
    }

    const ctx =
      sharedContext ?? (await this.buildMonthlyMobilizationContext(month));
    const { endDateStr, startDate, endDate, dayInfo, mobilizationsByEmployee, employeeIdsByProjectForMonth } =
      ctx;

    // Get project
    let project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['client'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    project = await this.ensureProjectOffDaysConfigured(project);

    // Get or create timesheet
    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
      relations: ['entries', 'entries.employee'],
    });

    // Employees who worked on this project on at least one day this month
    // (includes mid-month transfers to/from other projects).
    const employeeIdsForProject = new Set<number>(
      employeeIdsByProjectForMonth.get(project.id) ?? [],
    );

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
      // Prefer employee relation from a mobilization; fall back to timesheet entry.
      const entryEmployee = timesheet?.entries?.find(
        (e) => e.employeeId === employeeId,
      )?.employee;
      const employeeEntity = latestMob?.employee ?? entryEmployee;
      if (!employeeEntity) {
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

        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId && formatDateOnly(e.date) === dateStr,
        );

        // Only show hours when mobilization says the employee is on this project
        // that day (demobilized / leave / transfer = blank). Saved entries do not
        // override assignment — stale auto-sync rows must not create phantom hours.
        if (!isAssignedToProject(effectiveMob, project.id)) {
          continue;
        }

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

        // Check if this day is a project off day (defaults to Sunday when unset)
        const isProjectOffDay = getEffectiveProjectOffDays(project).includes(
          dayOfWeekName,
        );

        let hours: number;
        let jobStatus: string;
        const savedEntryUserEdited = existingEntry
          ? this.isTimesheetEntryUserEdited(existingEntry)
          : false;

        if (existingEntry) {
          // Saved timesheet status wins (e.g. absent must show "A", not carried active).
          const rawStatus =
            this.normalizeJobStatus(existingEntry.jobStatus) ??
            carriedStatus ??
            JobStatus.ACTIVE;
          // Respect the saved hours exactly, including an explicit 0 on an
          // active day (do not inflate to the default 10h).
          const normalized = this.normalizeStatusAndHours(
            rawStatus,
            Number(existingEntry.hoursWorked),
            true,
          );
          hours = normalized.hoursWorked;
          jobStatus = normalized.jobStatus;
        } else if (isActualMobilizationForThisDate) {
          // There's an actual mobilization record for this specific date
          const normalized = this.normalizeStatusAndHours(
            effectiveMob!.jobStatus,
            this.getDefaultHoursForStatus(effectiveMob!.jobStatus),
          );
          hours = normalized.hoursWorked;
          jobStatus = normalized.jobStatus;
        } else if (effectiveMob) {
          // Carry-forward: working days use carried status with default hours.
          const normalized = this.normalizeStatusAndHours(
            effectiveMob.jobStatus,
            this.getDefaultHoursForStatus(effectiveMob.jobStatus),
          );
          hours = normalized.hoursWorked;
          jobStatus = normalized.jobStatus;
        } else {
          continue;
        }

        const calendarAdjusted = this.applyCalendarOffRules(
          jobStatus,
          hours,
          isProjectOffDay,
          specialDayRates,
          savedEntryUserEdited ||
            (isProjectOffDay &&
              hours > 0 &&
              hours !== this.getDefaultHoursForStatus(JobStatus.ACTIVE)),
        );
        hours = calendarAdjusted.hoursWorked;
        jobStatus = calendarAdjusted.jobStatus;

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
          employeeId: employeeEntity.id,
          idNo: employeeEntity.adaa_emp_code,
          name: employeeEntity.name,
          trade: latestMob?.mobilizedTrade?.skill || '',
          skillId: latestMob?.mobilizedTradeId,
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
  /** Roster metadata for overview/search — no per-day grid. */
  private buildProjectRosterForOverview(
    projectId: number,
    ctx: MonthlyMobilizationContext,
    timesheet: Timesheet | null,
  ): MonthlyProjectTimesheetData['employees'] {
    const employeeIds =
      ctx.employeeIdsByProjectForMonth.get(projectId) ?? new Set<number>();
    if (employeeIds.size === 0) {
      return [];
    }

    const pickRepresentativeMob = (
      mobs: Mobilization[],
      pid: number,
    ): Mobilization | undefined => {
      if (mobs.length === 0) return undefined;
      return mobs.find((m) => m.projectId === pid) ?? mobs[0];
    };

    const employees: MonthlyProjectTimesheetData['employees'] = [];
    let srNo = 1;

    for (const employeeId of employeeIds) {
      const employeeMobilizations =
        ctx.mobilizationsByEmployee.get(employeeId) || [];
      let hasDayOnProject = false;
      for (const { dateStr } of ctx.dayInfo) {
        const effectiveMob = getEffectiveMobilizationForDate(
          employeeMobilizations,
          dateStr,
        );
        if (isAssignedToProject(effectiveMob, projectId)) {
          hasDayOnProject = true;
          break;
        }
      }
      if (!hasDayOnProject) {
        continue;
      }

      const latestMob = pickRepresentativeMob(
        employeeMobilizations,
        projectId,
      );
      const entryEmployee = timesheet?.entries?.find(
        (e) => e.employeeId === employeeId,
      )?.employee;
      const employeeEntity = latestMob?.employee ?? entryEmployee;
      if (!employeeEntity) {
        continue;
      }

      employees.push({
        srNo: srNo++,
        employeeId: employeeEntity.id,
        idNo: employeeEntity.adaa_emp_code,
        name: employeeEntity.name,
        trade: latestMob?.mobilizedTrade?.skill || '',
        skillId: latestMob?.mobilizedTradeId ?? 0,
        dailyHours: [],
      });
    }

    return employees;
  }

  /**
   * Lightweight month index: project list, timesheet status, roster counts — no daily grid.
   */
  async getAllProjectTimesheetsOverview(
    month: string,
  ): Promise<MonthlyProjectTimesheetData[]> {
    const projects = await this.projectRepository.find({
      relations: ['client'],
      order: { name: 'ASC' },
    });

    const sharedContext = await this.buildMonthlyMobilizationContext(month);

    const timesheets = await this.timesheetRepository.find({
      where: { month },
      relations: ['entries', 'entries.employee'],
    });
    const timesheetByProjectId = new Map<number | null, Timesheet>();
    for (const sheet of timesheets) {
      timesheetByProjectId.set(sheet.projectId ?? null, sheet);
    }

    const overview: MonthlyProjectTimesheetData[] = [];

    for (const project of projects) {
      const roster = this.buildProjectRosterForOverview(
        project.id,
        sharedContext,
        timesheetByProjectId.get(project.id) ?? null,
      );
      if (roster.length === 0) {
        continue;
      }
      overview.push({
        timesheet: timesheetByProjectId.get(project.id) ?? null,
        project,
        employees: roster,
      });
    }

    const idleEmployees = await this.getMonthlyIdleTimesheetData(
      month,
      sharedContext,
    );
    if (idleEmployees.employees.length > 0) {
      overview.push(idleEmployees);
    }

    return overview;
  }

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
            `Failed to get timesheet for project ${project.id}: ${this.getErrorMessage(error)}`,
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
   * Monthly timesheet with projectId = null: idle employees, demobilized annual-leave days,
   * and demobilized urgent-leave days.
   * Includes anyone with at least one idle, annual_leave, or demobilized urgent_leave day.
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
        const isUrgentLeaveDay = carriedStatus === JobStatus.URGENT_LEAVE;

        const baselineStatus = isAnnualLeaveDay
          ? JobStatus.ANNUAL_LEAVE
          : isUrgentLeaveDay
            ? JobStatus.URGENT_LEAVE
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
        } else if (isUrgentLeaveDay) {
          jobStatus = JobStatus.URGENT_LEAVE;
          hours = this.getDefaultHoursForStatus(JobStatus.URGENT_LEAVE);
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

        // Override stale persisted "off" rows when mobilization baseline is leave (e.g. old saves).
        if (isSunday && (isAnnualLeaveDay || isUrgentLeaveDay)) {
          jobStatus = isAnnualLeaveDay
            ? JobStatus.ANNUAL_LEAVE
            : JobStatus.URGENT_LEAVE;
          hours = this.getDefaultHoursForStatus(jobStatus);
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
    let projectForCalendar: Project | null = null;

    const resolveProjectForCalendar = async (): Promise<Project | null> => {
      if (isIdleTimesheet || timesheet.projectId == null) {
        return null;
      }
      if (!projectForCalendar) {
        const project = await this.projectRepository.findOne({
          where: { id: timesheet.projectId },
        });
        projectForCalendar = project
          ? await this.ensureProjectOffDaysConfigured(project)
          : null;
      }
      return projectForCalendar;
    };

    for (const entryDto of saveEntriesDto.entries) {
      // Parse date as timezone-neutral
      const entryDate = parseDateOnly(entryDto.date);

      // Check if entry exists (date is now a string)
      const dateString = formatDateOnly(entryDate);
      let hoursWorked = Number(entryDto.hoursWorked) || 0;
      let jobStatus = entryDto.jobStatus;
      let lowerStatus =
        typeof entryDto.jobStatus === 'string'
          ? entryDto.jobStatus.toLowerCase()
          : '';
      if (
        isIdleTimesheet &&
        this.isUtcSunday(dateString) &&
        lowerStatus !== 'annual_leave' &&
        lowerStatus !== 'urgent_leave'
      ) {
        hoursWorked = 0;
        jobStatus = JobStatus.OFF;
        lowerStatus = JobStatus.OFF;
      }
      // Project off day only: entered hours mean the employee worked that day.
      if (
        !isIdleTimesheet &&
        hoursWorked > 0 &&
        lowerStatus === JobStatus.OFF
      ) {
        const project = await resolveProjectForCalendar();
        if (project && this.isDateProjectOffDay(project, dateString)) {
          jobStatus = JobStatus.ACTIVE;
          lowerStatus = JobStatus.ACTIVE;
        }
      }
      // Enforce pairing: leave/off → 0h; active with 0h → default 10h.
      const normalized = this.normalizeStatusAndHours(jobStatus, hoursWorked);
      hoursWorked = normalized.hoursWorked;
      jobStatus = normalized.jobStatus;
      lowerStatus = normalized.jobStatus;

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
      // Off-day worked entries must count as user-edited so calendar rules keep hours.
      const project = await resolveProjectForCalendar();
      const isProjectOffDayWorked =
        !isIdleTimesheet &&
        project != null &&
        this.isDateProjectOffDay(project, dateString) &&
        Number(savedEntry.hoursWorked) > 0;
      if (isProjectOffDayWorked) {
        const editedAt = new Date(
          Math.max(Date.now(), savedEntry.createdAt.getTime() + 2000),
        );
        await this.entryRepository.update(savedEntry.id, { updatedAt: editedAt });
        savedEntry.updatedAt = editedAt;
      }
      savedEntries.push(savedEntry);

      // Sync to mobilization when the entry's status differs from the effective
      // mobilization. The sync function only reacts to status changes (not project),
      // so saving default entries won't break carry-forward logic.
      // Idle-sheet Sundays: skip mobilization sync for forced "off", but sync annual_leave Sundays.
      const savedLower = String(savedEntry.jobStatus).toLowerCase();
      const skipIdleSundayMobSync =
        isIdleTimesheet &&
        this.isUtcSunday(dateString) &&
        savedLower !== 'annual_leave' &&
        savedLower !== 'urgent_leave';
      if (!skipIdleSundayMobSync) {
        await this.syncMobilizationFromTimesheetEntry(
          savedEntry,
          timesheet.projectId ?? null,
          updatedBy,
        );
      }
    }

    this.invalidateMonthlyMobilizationContextCache(timesheet.month);
    void this.repairInconsistentStatusHours(timesheet.month)
      .then((repaired) => {
        if (repaired > 0) {
          this.invalidateMonthlyMobilizationContextCache(timesheet.month);
        }
      })
      .catch((error) => {
        this.logger.warn(
          `Post-save timesheet repair failed for ${timesheet.month}: ${this.getErrorMessage(error)}`,
        );
      });

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
   * Move saved timesheet rows from the old project to the new project for every
   * day from the transfer date through month end (statuses and hours preserved).
   */
  /** Resolve inclusive end date for a transfer/shift (optional hard cap). */
  async resolveTransferRangeEnd(
    employeeId: number,
    toProjectId: number,
    transferDateStr: string,
    rangeEndCap?: string,
  ): Promise<string> {
    const month = transferDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);

    let rangeEnd = monthEnd;
    if (rangeEndCap && compareDateOnly(rangeEndCap, monthEnd) <= 0) {
      rangeEnd = rangeEndCap;
    } else if (!rangeEndCap) {
      const stintEnd = await this.getProjectStintEndDate(
        employeeId,
        toProjectId,
        transferDateStr,
      );
      rangeEnd =
        compareDateOnly(stintEnd, monthEnd) <= 0 ? stintEnd : monthEnd;
    }

    if (compareDateOnly(rangeEnd, transferDateStr) < 0) {
      return transferDateStr;
    }
    return rangeEnd;
  }

  /** Best source project to pull timesheet rows from during a same-month transfer. */
  async findPrimarySourceProjectForTransfer(
    employeeId: number,
    toProjectId: number,
    transferDateStr: string,
  ): Promise<number | null> {
    const month = transferDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);

    const row = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoin('entry.timesheet', 'timesheet')
      .select('timesheet.projectId', 'projectId')
      .addSelect('MIN(entry.date)', 'minDate')
      .where('entry.employeeId = :employeeId', { employeeId })
      .andWhere('timesheet.month = :month', { month })
      .andWhere('timesheet.projectId IS NOT NULL')
      .andWhere('timesheet.projectId != :toProjectId', { toProjectId })
      .andWhere('entry.date >= :transferDate', { transferDate: transferDateStr })
      .andWhere('entry.date <= :rangeEnd', { rangeEnd: monthEnd })
      .groupBy('timesheet.projectId')
      .orderBy('MIN(entry.date)', 'ASC')
      .limit(1)
      .getRawOne<{ projectId: string }>();

    if (!row?.projectId) {
      return null;
    }

    const projectId = Number(row.projectId);
    return Number.isFinite(projectId) && projectId > 0 ? projectId : null;
  }

  /** Project ids (excluding one) where the employee has saved rows in a date range. */
  async findOtherProjectIdsWithEntriesInRange(
    employeeId: number,
    month: string,
    rangeStart: string,
    rangeEnd: string,
    excludeProjectId: number,
  ): Promise<number[]> {
    const rows = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoin('entry.timesheet', 'timesheet')
      .select('DISTINCT timesheet.projectId', 'projectId')
      .where('entry.employeeId = :employeeId', { employeeId })
      .andWhere('timesheet.month = :month', { month })
      .andWhere('timesheet.projectId IS NOT NULL')
      .andWhere('timesheet.projectId != :excludeProjectId', {
        excludeProjectId,
      })
      .andWhere('entry.date >= :rangeStart', { rangeStart })
      .andWhere('entry.date <= :rangeEnd', { rangeEnd })
      .getRawMany<{ projectId: string }>();

    return rows
      .map((row) => Number(row.projectId))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  async shiftTimesheetEntriesOnProjectTransfer(
    employeeId: number,
    transferDateStr: string,
    fromProjectId: number,
    toProjectId: number,
    updatedBy: number,
    rangeEndCap?: string,
  ): Promise<number> {
    if (fromProjectId === toProjectId) {
      return 0;
    }

    const month = transferDateStr.slice(0, 7);
    const rangeEnd = await this.resolveTransferRangeEnd(
      employeeId,
      toProjectId,
      transferDateStr,
      rangeEndCap,
    );

    const fromTimesheet = await this.timesheetRepository.findOne({
      where: { projectId: fromProjectId, month },
    });
    if (!fromTimesheet) {
      return 0;
    }

    if (
      fromTimesheet.status === TimesheetStatus.SUBMITTED ||
      fromTimesheet.status === TimesheetStatus.APPROVED
    ) {
      this.logger.warn(
        `Skipping timesheet shift for employee ${employeeId}: source project ${fromProjectId} ` +
          `timesheet for ${month} is ${fromTimesheet.status}`,
      );
      return 0;
    }

    let toTimesheet = await this.timesheetRepository.findOne({
      where: { projectId: toProjectId, month },
    });
    if (!toTimesheet) {
      toTimesheet = await this.timesheetRepository.save(
        this.timesheetRepository.create({
          projectId: toProjectId,
          month,
          createdBy: updatedBy,
        }),
      );
    }

    if (
      toTimesheet.status === TimesheetStatus.SUBMITTED ||
      toTimesheet.status === TimesheetStatus.APPROVED
    ) {
      this.logger.warn(
        `Skipping timesheet shift for employee ${employeeId}: target project ${toProjectId} ` +
          `timesheet for ${month} is ${toTimesheet.status}`,
      );
      return 0;
    }

    const toProject = await this.projectRepository.findOne({
      where: { id: toProjectId },
    });
    const specialDayRatesMap = toProject
      ? await this.specialDaysService.getSpecialDayRatesForRange(
          parseDateOnly(transferDateStr),
          parseDateOnly(rangeEnd),
          toProjectId,
        )
      : new Map();

    const entries = await this.entryRepository
      .createQueryBuilder('entry')
      .where('entry.timesheetId = :timesheetId', { timesheetId: fromTimesheet.id })
      .andWhere('entry.employeeId = :employeeId', { employeeId })
      .andWhere('entry.date >= :transferDate', { transferDate: transferDateStr })
      .andWhere('entry.date <= :rangeEnd', { rangeEnd })
      .orderBy('entry.date', 'ASC')
      .getMany();

    let moved = 0;
    for (const entry of entries) {
      const existingOnTarget = await this.entryRepository.findOne({
        where: {
          timesheetId: toTimesheet.id,
          employeeId,
          date: entry.date as any,
        },
      });
      if (existingOnTarget) {
        await this.entryRepository.delete({ id: existingOnTarget.id });
      }

      entry.timesheetId = toTimesheet.id;
      entry.updatedBy = updatedBy;

      const dateStr = formatDateOnly(entry.date);
      const specialDayRates =
        specialDayRatesMap.get(dateStr) ??
        this.defaultSpecialDayRates(dateStr);
      const adjusted = this.resolveCalendarAdjustedCell(
        toProject,
        dateStr,
        entry.jobStatus,
        Number(entry.hoursWorked),
        specialDayRates,
        this.isTimesheetEntryUserEdited(entry),
      );
      entry.jobStatus = adjusted.jobStatus as any;
      entry.hoursWorked = adjusted.hoursWorked;

      await this.entryRepository.save(entry);
      moved++;
    }

    if (moved > 0) {
      this.logger.log(
        `Shifted ${moved} timesheet entry/entries for employee ${employeeId} ` +
          `from project ${fromProjectId} to ${toProjectId} starting ${transferDateStr}`,
      );
    }

    return moved;
  }

  /**
   * Remove saved timesheet rows that no longer match mobilization assignment
   * (e.g. after a stint start moves from Jul 1 → Jul 2 on the same project).
   */
  async pruneStaleTimesheetEntriesForEmployeeMonth(
    employeeId: number,
    month: string,
  ): Promise<number> {
    const { end: monthEnd } = getMonthDateRange(month);

    const mobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(monthEnd) as any,
      },
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    const entries = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.timesheet', 'timesheet')
      .where('entry.employeeId = :employeeId', { employeeId })
      .andWhere('timesheet.month = :month', { month })
      .andWhere('timesheet.projectId IS NOT NULL')
      .getMany();

    let removed = 0;
    for (const entry of entries) {
      const dateStr = formatDateOnly(entry.date);
      const projectId = entry.timesheet.projectId;
      if (!projectId) {
        continue;
      }

      const effective = getEffectiveMobilizationForDate(mobilizations, dateStr);
      if (!isAssignedToProject(effective, projectId)) {
        await this.entryRepository.delete({ id: entry.id });
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(
        `Pruned ${removed} stale timesheet entry/entries for employee ${employeeId} in ${month}`,
      );
    }

    return removed;
  }

  /** Delete project-grid rows before a corrected stint start date. */
  async clearProjectTimesheetEntriesBeforeDate(
    employeeId: number,
    projectId: number,
    month: string,
    beforeDateStr: string,
  ): Promise<number> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
    });
    if (!timesheet) {
      return 0;
    }

    if (
      timesheet.status === TimesheetStatus.SUBMITTED ||
      timesheet.status === TimesheetStatus.APPROVED
    ) {
      return 0;
    }

    const result = await this.entryRepository
      .createQueryBuilder()
      .delete()
      .from(TimesheetEntry)
      .where('timesheetId = :timesheetId', { timesheetId: timesheet.id })
      .andWhere('employeeId = :employeeId', { employeeId })
      .andWhere('date < :beforeDate', { beforeDate: beforeDateStr })
      .execute();

    return result.affected ?? 0;
  }

  /**
   * After a mid-month transfer, remove any rows left on the old project from the
   * transfer date forward (shift/materialize should already have moved them).
   */
  async clearProjectTimesheetEntriesFromDate(
    employeeId: number,
    projectId: number,
    fromDateStr: string,
    month: string,
  ): Promise<number> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
    });
    if (!timesheet) {
      return 0;
    }

    if (
      timesheet.status === TimesheetStatus.SUBMITTED ||
      timesheet.status === TimesheetStatus.APPROVED
    ) {
      return 0;
    }

    const result = await this.entryRepository
      .createQueryBuilder()
      .delete()
      .from(TimesheetEntry)
      .where('timesheetId = :timesheetId', { timesheetId: timesheet.id })
      .andWhere('employeeId = :employeeId', { employeeId })
      .andWhere('date >= :fromDate', { fromDate: fromDateStr })
      .execute();

    const removed = result.affected ?? 0;
    if (removed > 0) {
      this.logger.log(
        `Cleared ${removed} stale timesheet entry/entries for employee ${employeeId} ` +
          `on project ${projectId} from ${fromDateStr} in ${month}`,
      );
    }

    return removed;
  }

  /** Remove saved rows on a project within an inclusive date range. */
  async clearProjectTimesheetEntriesInRange(
    employeeId: number,
    projectId: number,
    month: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<number> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
    });
    if (!timesheet) {
      return 0;
    }

    if (
      timesheet.status === TimesheetStatus.SUBMITTED ||
      timesheet.status === TimesheetStatus.APPROVED
    ) {
      return 0;
    }

    const result = await this.entryRepository
      .createQueryBuilder()
      .delete()
      .from(TimesheetEntry)
      .where('timesheetId = :timesheetId', { timesheetId: timesheet.id })
      .andWhere('employeeId = :employeeId', { employeeId })
      .andWhere('date >= :rangeStart', { rangeStart })
      .andWhere('date <= :rangeEnd', { rangeEnd })
      .execute();

    return result.affected ?? 0;
  }

  /** Last calendar day (inclusive) the employee stays on toProject after transferDate. */
  async getProjectStintEndDate(
    employeeId: number,
    toProjectId: number,
    transferDateStr: string,
  ): Promise<string> {
    const month = transferDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);

    const nextTransfer = await this.mobilizationRepository
      .createQueryBuilder('m')
      .where('m.employeeId = :employeeId', { employeeId })
      .andWhere('m.actionDate > :transferDate', { transferDate: transferDateStr })
      .andWhere('m.actionDate <= :monthEnd', { monthEnd })
      .andWhere('m.projectId IS NOT NULL')
      .andWhere('m.projectId != :toProjectId', { toProjectId })
      .andWhere('m.mobStatus = :mobilized', { mobilized: MobStatus.MOBILIZED })
      .orderBy('m.actionDate', 'ASC')
      .getOne();

    if (!nextTransfer) {
      return monthEnd;
    }

    const dayBefore = parseDateOnly(formatDateOnly(nextTransfer.actionDate));
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const endDate = formatDateOnly(dayBefore);

    if (compareDateOnly(endDate, transferDateStr) < 0) {
      return transferDateStr;
    }

    return endDate;
  }

  /**
   * After a mid-month transfer, create project timesheet rows on the new project
   * for every day from the transfer date when mobilization assigns the employee
   * there but no saved entry exists yet (carry-forward and day-specific statuses).
   */
  async materializeTransferredTimesheetEntries(
    employeeId: number,
    transferDateStr: string,
    fromProjectId: number,
    toProjectId: number,
    updatedBy: number,
    rangeEndCap?: string,
  ): Promise<number> {
    const month = transferDateStr.slice(0, 7);
    const { end: monthEnd } = getMonthDateRange(month);
    const rangeEnd = await this.resolveTransferRangeEnd(
      employeeId,
      toProjectId,
      transferDateStr,
      rangeEndCap,
    );

    let toTimesheet = await this.timesheetRepository.findOne({
      where: { projectId: toProjectId, month },
    });
    if (!toTimesheet) {
      toTimesheet = await this.timesheetRepository.save(
        this.timesheetRepository.create({
          projectId: toProjectId,
          month,
          createdBy: updatedBy,
        }),
      );
    }

    if (
      toTimesheet.status === TimesheetStatus.SUBMITTED ||
      toTimesheet.status === TimesheetStatus.APPROVED
    ) {
      return 0;
    }

    const fromTimesheet = await this.timesheetRepository.findOne({
      where: { projectId: fromProjectId, month },
    });

    const toProject = await this.projectRepository.findOne({
      where: { id: toProjectId },
    });
    if (!toProject) {
      return 0;
    }

    const mobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(monthEnd) as any,
      },
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });

    const specialDayRatesMap =
      await this.specialDaysService.getSpecialDayRatesForRange(
        parseDateOnly(transferDateStr),
        parseDateOnly(rangeEnd),
        toProjectId,
      );

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = parseDateOnly(monthEnd).getUTCDate();
    let created = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (compareDateOnly(dateStr, transferDateStr) < 0) {
        continue;
      }
      if (compareDateOnly(dateStr, rangeEnd) > 0) {
        continue;
      }

      const effective = getEffectiveMobilizationForDate(mobilizations, dateStr);
      if (!effective || !isAssignedToProject(effective, toProjectId)) {
        continue;
      }

      const existingOnTarget = await this.entryRepository.findOne({
        where: {
          timesheetId: toTimesheet.id,
          employeeId,
          date: dateStr as any,
        },
      });
      if (existingOnTarget) {
        continue;
      }

      if (fromTimesheet) {
        const staleOnSource = await this.entryRepository.findOne({
          where: {
            timesheetId: fromTimesheet.id,
            employeeId,
            date: dateStr as any,
          },
        });
        if (staleOnSource) {
          await this.entryRepository.delete({ id: staleOnSource.id });
        }
      }

      const hours = this.getDefaultHoursForStatus(effective.jobStatus);
      const normalized = this.normalizeStatusAndHours(
        effective.jobStatus,
        hours,
      );
      const specialDayRates =
        specialDayRatesMap.get(dateStr) ?? this.defaultSpecialDayRates(dateStr);
      const calendarAdjusted = this.resolveCalendarAdjustedCell(
        toProject,
        dateStr,
        normalized.jobStatus,
        normalized.hoursWorked,
        specialDayRates,
        false,
      );
      await this.entryRepository.save(
        this.entryRepository.create({
          timesheetId: toTimesheet.id,
          employeeId,
          date: dateStr as any,
          jobStatus: calendarAdjusted.jobStatus as any,
          hoursWorked: calendarAdjusted.hoursWorked,
          createdBy: updatedBy,
        }),
      );
      created++;
    }

    if (created > 0) {
      this.logger.log(
        `Materialized ${created} timesheet entry/entries on project ${toProjectId} ` +
          `for employee ${employeeId} from ${transferDateStr}`,
      );
    }

    return created;
  }

  /**
   * When mobilization status changes, update matching timesheet entries for that
   * exact date. Day-specific statuses (absent, sick leave, etc.) always win with
   * 0h when an explicit mobilization row exists on that date. Other leave types
   * keep existing hours > 0 as worked time (status becomes active).
   */
  async syncTimesheetFromMobilization(
    employeeId: number,
    date: string,
  ): Promise<void> {
    const dateStr = formatDateOnly(date);

    const mobilizations = await this.mobilizationRepository.find({
      where: {
        employeeId,
        actionDate: LessThanOrEqual(dateStr) as any,
      },
      order: { actionDate: 'DESC', createdAt: 'DESC' },
    });
    if (mobilizations.length === 0) {
      return;
    }

    const exactDateMob = mobilizations.find(
      (m) => formatDateOnly(m.actionDate) === dateStr,
    );
    const effective =
      exactDateMob ??
      getEffectiveMobilizationForDate(mobilizations, dateStr);
    if (!effective) {
      return;
    }

    const entries = await this.entryRepository
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.timesheet', 'timesheet')
      .where('entry.employeeId = :employeeId', { employeeId })
      .andWhere('entry.date = :date', { date: dateStr })
      .getMany();

    for (const entry of entries) {
      // Only update the timesheet for the project this mobilization belongs to
      // (null projectId = idle / annual-leave sheet).
      if (entry.timesheet.projectId !== effective.projectId) {
        continue;
      }

      const project =
        entry.timesheet.projectId != null
          ? await this.projectRepository.findOne({
              where: { id: entry.timesheet.projectId },
            })
          : null;

      const specialDayRates = project
        ? await this.specialDaysService.getSpecialDayRates(
            parseDateOnly(dateStr),
            project.id,
          )
        : this.defaultSpecialDayRates(dateStr);

      const existingHours = Number(entry.hoursWorked) || 0;
      const mobAuthoritativeForDay =
        exactDateMob != null &&
        isDaySpecificJobStatus(exactDateMob.jobStatus, exactDateMob);
      const hoursForNormalize = mobAuthoritativeForDay
        ? this.getDefaultHoursForStatus(exactDateMob!.jobStatus)
        : this.isLeaveStatus(effective.jobStatus)
          ? existingHours
          : this.getDefaultHoursForStatus(effective.jobStatus);
      const normalized = this.normalizeStatusAndHours(
        effective.jobStatus,
        hoursForNormalize,
      );

      const calendarAdjusted = this.resolveCalendarAdjustedCell(
        project,
        dateStr,
        normalized.jobStatus,
        normalized.hoursWorked,
        specialDayRates,
        this.isTimesheetEntryUserEdited(entry),
      );

      entry.jobStatus = calendarAdjusted.jobStatus as any;
      entry.hoursWorked = calendarAdjusted.hoursWorked;
      await this.entryRepository.save(entry);
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

      const effectiveMob = getEffectiveMobilizationForDate(
        currentMobilizations,
        dateStr,
      );

      // Don't sync when this timesheet belongs to a project the employee is
      // not assigned to on this date (e.g. after a mid-month transfer).
      if (
        projectId !== null &&
        !isAssignedToProject(effectiveMob, projectId)
      ) {
        this.logger.log(
          `Skipping sync for employee ${entry.employeeId} on ${dateStr}: ` +
            `not assigned to timesheet project ${projectId}`,
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
        const baseMob = effectiveMob ?? currentMobilizations[0];
        const statusDiffers = baseMob.jobStatus !== entry.jobStatus;
        const needsDemobilization =
          shouldDemobilize && baseMob.mobStatus !== MobStatus.DEMOBILIZED;

        if (statusDiffers || needsDemobilization) {
          const targetProjectId = shouldDemobilize
            ? null
            : projectId != null
              ? projectId
              : baseMob.projectId;
          const newMob = this.mobilizationRepository.create({
            employeeId: entry.employeeId,
            mobilizedTradeId: baseMob.mobilizedTradeId,
            projectId: targetProjectId,
            mobStatus: shouldDemobilize
              ? MobStatus.DEMOBILIZED
              : baseMob.mobStatus,
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
        `Failed to sync mobilization for employee ${entry.employeeId}: ${this.getErrorMessage(error)}`,
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

    const saved = await this.timesheetRepository.save(timesheet);
    this.invalidateMonthlyMobilizationContextCache(saved.month);
    return saved;
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

    this.invalidateMonthlyMobilizationContextCache(savedTimesheet.month);

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
      .leftJoinAndSelect('employee.supplier', 'supplier')
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
            trades: Map<string, Map<string, number>>;
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
      const supplierName = mob.employee?.supplier?.name?.trim() || 'Unassigned';

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

      if (!project.trades.has(tradeName)) {
        project.trades.set(tradeName, new Map());
      }
      const supplierCounts = project.trades.get(tradeName)!;
      supplierCounts.set(supplierName, (supplierCounts.get(supplierName) || 0) + 1);
    }

    // Convert to output format
    const clients: ClientUtilization[] = [];
    let totalManpower = 0;

    for (const [clientId, clientData] of clientMap) {
      const projects: ProjectUtilization[] = [];
      let clientTotal = 0;

      for (const [projectId, projectData] of clientData.projects) {
        const trades: TradeUtilization[] = [];

        for (const [tradeName, supplierCounts] of projectData.trades) {
          for (const [supplierName, headCount] of supplierCounts) {
          trades.push({
            tradeInSite: tradeName,
              supplier: supplierName,
            headCount,
          });
          clientTotal += headCount;
          }
        }

        trades.sort((a, b) => {
          const tradeCompare = a.tradeInSite.localeCompare(b.tradeInSite);
          if (tradeCompare !== 0) return tradeCompare;
          return a.supplier.localeCompare(b.supplier);
        });

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
