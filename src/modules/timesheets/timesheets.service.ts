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

export interface MonthlyProjectTimesheetData {
  timesheet: Timesheet | null;
  project: Project;
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

    // Get project
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['client'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get or create timesheet
    let timesheet = await this.timesheetRepository.findOne({
      where: { projectId, month },
      relations: ['entries', 'entries.employee'],
    });

    // Get all mobilizations for this project
    // actionDate is now a string, so we use string comparison
    const endDateStr = formatDateOnly(endDate);
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

    const employees: any[] = [];
    let srNo = 1;

    for (const [employeeId, latestMob] of employeeMap.entries()) {
      // Get all mobilizations for this employee to determine status for each day
      // actionDate is now a string, so we use string comparison
      const employeeMobilizations = await this.mobilizationRepository.find({
        where: {
          employeeId,
          actionDate: LessThanOrEqual(endDateStr) as any,
        },
        order: {
          actionDate: 'DESC',
          createdAt: 'DESC',
        },
      });

      // Build daily hours
      const dailyHours: any[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Create date at UTC midnight for timezone-neutral operations
        const currentDate = parseDateOnly(dateStr);

        // Get day of week name (e.g., 'Monday', 'Tuesday', etc.)
        const dayOfWeekName = currentDate.toLocaleDateString('en-US', {
          weekday: 'long',
        });

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

        // Determine if employee should appear in timesheet for this date
        // Only show if:
        // 1. Currently mobilized to this project, OR
        // 2. Has saved timesheet entries with hours > 0, OR
        // 3. Has idle status (idle employees should show even if demobilized)
        const isMobilizedToProject =
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.MOBILIZED &&
          effectiveMob.projectId === project.id;

        const isIdleEmployee =
          effectiveMob &&
          effectiveMob.jobStatus === JobStatus.IDLE &&
          effectiveMob.projectId === project.id;

        const hasSavedHours =
          existingEntry && Number(existingEntry.hoursWorked) > 0;
        const hasSavedEntry = !!existingEntry;

        // Only include dates where employee is mobilized OR idle OR has saved work hours OR has any saved entry (e.g. sick leave with 0 hours)
        if (
          isMobilizedToProject ||
          isIdleEmployee ||
          hasSavedHours ||
          hasSavedEntry
        ) {
          // If demobilized but has saved hours/entry or is idle, show those hours
          // If demobilized with no saved hours/entry and not idle, don't show the day at all
          if (
            !isMobilizedToProject &&
            !hasSavedHours &&
            !isIdleEmployee &&
            !hasSavedEntry
          ) {
            continue; // Skip this day
          }

          // Check if the effective mobilization is from this exact date (user-entered)
          // or carried forward from a previous date (using timezone-neutral comparison)
          const effectiveMobDateStr = effectiveMob
            ? formatDateOnly(effectiveMob.actionDate)
            : null;
          const isActualMobilizationForThisDate =
            effectiveMobDateStr === dateStr;

          // If this is the first day of demobilization (but not idle), show "demobilized" status
          // Idle employees should show with their idle hours, not as demobilized
          const isDemobilizationDay =
            effectiveMob &&
            effectiveMob.mobStatus === MobStatus.DEMOBILIZED &&
            effectiveMob.jobStatus !== JobStatus.IDLE &&
            isActualMobilizationForThisDate;

          // Check for special days first (higher priority) - using timezone-neutral date
          // Pass projectId to get project-specific client rate multiplier
          const specialDayRates =
            await this.specialDaysService.getSpecialDayRates(
              currentDate,
              project.id,
            );

          // Check if this day is a project off day
          const isProjectOffDay =
            project.offDays &&
            Array.isArray(project.offDays) &&
            project.offDays.includes(dayOfWeekName);

          let hours: number;
          let jobStatus: string;

          if (isDemobilizationDay) {
            // First day of demobilization - show as "demobilized" with 0 hours
            hours = 0;
            jobStatus = 'demobilized';
          } else if (existingEntry) {
            // If user has saved a timesheet entry for this day, respect their data
            hours = Number(existingEntry.hoursWorked);
            jobStatus = existingEntry.jobStatus;
          } else if (isActualMobilizationForThisDate) {
            // There's an actual mobilization record for this specific date
            // Use its status regardless of off-days/special days (user explicitly created this record)
            hours = this.getDefaultHoursForStatus(effectiveMob!.jobStatus);
            jobStatus = effectiveMob!.jobStatus;
          } else if (
            specialDayRates.isSpecialDay &&
            specialDayRates.isMandatoryOff
          ) {
            // Mandatory off day - must be off
            hours = 0;
            jobStatus = JobStatus.OFF;
          } else if (
            specialDayRates.isSpecialDay &&
            (specialDayRates.dayType === SpecialDayType.OPTIONAL_OFF ||
              specialDayRates.isDefaultOff)
          ) {
            // Optional off day or default off
            hours = 0;
            jobStatus = JobStatus.OFF;
          } else if (isProjectOffDay) {
            // No user entry, no mobilization record for today, and it's a project off day
            // Default to "Off" status for carried-forward entries
            hours = 0;
            jobStatus = JobStatus.OFF;
          } else if (effectiveMob) {
            // No user entry, not an off day - use smart carry-forward
            hours = this.getDefaultHoursForStatus(effectiveMob.jobStatus);
            jobStatus = effectiveMob.jobStatus;
          } else {
            // No effective mobilization - skip this day
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
        // If not mobilized and no saved hours, don't show this day (show as "-")
      }

      // Only include employee if they have mobilized days (not just demobilized)
      // Exclude employees who are demobilized at end of month and have no saved entries:
      // demobilization is sustained until remobilized, so they should not show in the project timesheet at all
      if (dailyHours.length > 0) {
        const effectiveAtEndOfMonth = this.getEffectiveMobilizationForDate(
          employeeMobilizations,
          endDateStr,
        );
        const isDemobilizedAtEndOfMonth =
          effectiveAtEndOfMonth?.mobStatus === MobStatus.DEMOBILIZED &&
          effectiveAtEndOfMonth?.jobStatus !== JobStatus.IDLE;
        const hasSavedEntryThisMonth =
          timesheet?.entries?.some((e) => e.employeeId === employeeId) ?? false;
        if (isDemobilizedAtEndOfMonth && !hasSavedEntryThisMonth) {
          continue; // Skip: do not show demobilized employees until remobilized
        }
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
        return 10;
      default:
        return 10;
    }
  }

  /**
   * Create or get a timesheet
   */
  async createOrGetTimesheet(
    createTimesheetDto: CreateTimesheetDto,
    createdBy: number,
  ): Promise<Timesheet> {
    // Check if timesheet already exists
    let timesheet = await this.timesheetRepository.findOne({
      where: {
        projectId: createTimesheetDto.projectId,
        month: createTimesheetDto.month,
      },
    });

    if (timesheet) {
      return timesheet;
    }

    // Create new timesheet
    timesheet = this.timesheetRepository.create({
      projectId: createTimesheetDto.projectId,
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

      const wasNew = !existingEntry;
      const previousJobStatus = existingEntry?.jobStatus;

      let entry: TimesheetEntry;
      if (existingEntry) {
        // Update existing entry
        existingEntry.hoursWorked = entryDto.hoursWorked;
        existingEntry.jobStatus = entryDto.jobStatus;
        existingEntry.notes = entryDto.notes || null;
        existingEntry.tradeInSiteId = entryDto.tradeInSiteId || null;
        existingEntry.updatedBy = updatedBy;
        entry = existingEntry;
      } else {
        // Create new entry (date will be transformed by DateOnlyTransformer)
        entry = this.entryRepository.create({
          timesheetId,
          employeeId: entryDto.employeeId,
          date: dateString as any, // TypeORM will handle the transformer
          hoursWorked: entryDto.hoursWorked,
          jobStatus: entryDto.jobStatus,
          notes: entryDto.notes,
          tradeInSiteId: entryDto.tradeInSiteId,
          createdBy: updatedBy,
        });
      }

      const savedEntry = await this.entryRepository.save(entry);
      savedEntries.push(savedEntry);

      // Sync mobilization only for this date when the user explicitly changed this cell.
      // Only sync when updating an existing entry and jobStatus changed — never sync for
      // new entries, since those are often the whole month (carry-forward). That would
      // wrongly create mobilizations for every day; we only want one mobilization record
      // for the date the user actually edited, and rely on carry-forward for the rest.
      const jobStatusChanged = previousJobStatus !== savedEntry.jobStatus;
      const explicitEditOnly = !wasNew && jobStatusChanged;
      if (explicitEditOnly) {
        await this.syncMobilizationFromTimesheetEntry(
          savedEntry,
          timesheet.projectId,
          updatedBy,
        );
      }
    }

    return savedEntries;
  }

  /**
   * Auto-sync mobilization record when timesheet entry status changes
   * Creates a new mobilization record if the job status differs from the current mobilization
   * Automatically demobilizes employee if status is: cancelled, absconded, annual_leave, resigned, or idle
   */
  private async syncMobilizationFromTimesheetEntry(
    entry: TimesheetEntry,
    projectId: number,
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

      // Check if there's already a mobilization record for this exact date (using timezone-neutral comparison)
      const exactDateMob = currentMobilizations.find((m) => {
        const mobDateStr = formatDateOnly(m.actionDate);
        return mobDateStr === dateStr;
      });

      // If job status is different, create/update mobilization
      if (exactDateMob) {
        // Mobilization exists for this date - update it if status changed
        const statusChanged = exactDateMob.jobStatus !== entry.jobStatus;
        const mobStatusChanged =
          shouldDemobilize && exactDateMob.mobStatus !== MobStatus.DEMOBILIZED;
        const projectMismatch = exactDateMob.projectId !== projectId;

        if (statusChanged || mobStatusChanged || projectMismatch) {
          exactDateMob.jobStatus = entry.jobStatus as JobStatus;

          // Auto-demobilize if status requires it
          if (shouldDemobilize) {
            exactDateMob.mobStatus = MobStatus.DEMOBILIZED;
            exactDateMob.projectId = null; // Remove project assignment when demobilized
          } else {
            // Ensure projectId is set when editing from timesheet (e.g. sick leave, absent)
            exactDateMob.mobStatus = MobStatus.MOBILIZED;
            exactDateMob.projectId = projectId;
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
          // Create new mobilization record for this date with the new status
          // actionDate is now a string (YYYY-MM-DD)
          const newMob = this.mobilizationRepository.create({
            employeeId: entry.employeeId,
            mobilizedTradeId: currentMob.mobilizedTradeId,
            projectId: shouldDemobilize ? null : projectId, // Remove project if demobilizing
            mobStatus: shouldDemobilize
              ? MobStatus.DEMOBILIZED
              : MobStatus.MOBILIZED,
            jobStatus: entry.jobStatus as JobStatus,
            actionDate: dateStr as any, // TypeORM will handle the transformer
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
   * Delete a timesheet (soft delete)
   */
  async remove(id: number, deletedBy: number): Promise<void> {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
    });

    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    if (timesheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException('Cannot delete an approved timesheet');
    }

    timesheet.deletedBy = deletedBy;
    timesheet.deletedAt = new Date();

    await this.timesheetRepository.save(timesheet);
  }

  /**
   * Get daily utilization report
   * Shows employee distribution across clients/projects/trades for a specific date
   */
  async getDailyUtilizationReport(
    date: string, // YYYY-MM-DD format
  ): Promise<DailyUtilizationReport> {
    const targetDate = parseDateOnly(date);

    // Get all mobilizations that are effective on the target date
    // We need the most recent mobilization for each employee up to and including the target date
    const mobilizations = await this.mobilizationRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.employee', 'employee')
      .leftJoinAndSelect('m.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('m.mobilizedTrade', 'trade')
      .where('m.actionDate <= :targetDate', { targetDate: date })
      .orderBy('m.employeeId', 'ASC')
      .addOrderBy('m.actionDate', 'DESC')
      .getMany();

    // Get the latest mobilization for each employee
    const employeeLatestMob = new Map<number, any>();
    for (const mob of mobilizations) {
      if (!employeeLatestMob.has(mob.employeeId)) {
        employeeLatestMob.set(mob.employeeId, mob);
      }
    }

    // Filter to only include mobilized employees with active status on active projects
    const activeMobilizations = Array.from(employeeLatestMob.values()).filter(
      (mob) =>
        mob.mobStatus === MobStatus.MOBILIZED &&
        mob.jobStatus === JobStatus.ACTIVE &&
        mob.project !== null,
    );

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
