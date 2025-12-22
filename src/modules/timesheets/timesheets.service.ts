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

export interface MonthlyProjectTimesheetData {
  timesheet: Timesheet | null;
  project: {
    id: number;
    name: string;
    client: {
      id: number;
      name: string;
    };
  };
  employees: Array<{
    srNo: number;
    employeeId: number;
    idNo: string;
    name: string;
    trade: string;
    dailyHours: Array<{
      date: string;
      day: number;
      hoursWorked: number;
      jobStatus: string | null;
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
    const mobilizations = await this.mobilizationRepository.find({
      where: {
        projectId: project.id,
        mobStatus: MobStatus.MOBILIZED,
        actionDate: LessThanOrEqual(endDate),
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
      const employeeMobilizations = await this.mobilizationRepository.find({
        where: {
          employeeId,
          actionDate: LessThanOrEqual(endDate),
        },
        order: {
          actionDate: 'DESC',
          createdAt: 'DESC',
        },
      });

      // Build daily hours
      const dailyHours: any[] = [];
      let wasPreviouslyMobilized = false;

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, monthNum - 1, day);
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Find effective mobilization for this date
        // Compare dates by converting to YYYY-MM-DD strings to avoid time/timezone issues
        const effectiveMob = employeeMobilizations.find((m) => {
          const mobDateStr = new Date(m.actionDate).toISOString().split('T')[0];
          return mobDateStr <= dateStr;
        });

        // Check if there's an existing entry
        const existingEntry = timesheet?.entries?.find(
          (e) =>
            e.employeeId === employeeId &&
            new Date(e.date).toISOString().split('T')[0] === dateStr,
        );

        // Only include if mobilized to this project
        if (
          effectiveMob &&
          effectiveMob.mobStatus === MobStatus.MOBILIZED &&
          effectiveMob.projectId === project.id
        ) {
          wasPreviouslyMobilized = true;
          const hours = existingEntry
            ? Number(existingEntry.hoursWorked)
            : this.getDefaultHoursForStatus(effectiveMob.jobStatus);

          dailyHours.push({
            date: dateStr,
            day,
            hoursWorked: hours,
            jobStatus: effectiveMob.jobStatus,
            notes: existingEntry?.notes || null,
            entryId: existingEntry?.id || null,
          });
        } else if (wasPreviouslyMobilized) {
          // Was mobilized before but not anymore - show "Dem" for first day, then "-"
          const isDemobilizedFirstDay = !dailyHours.find(
            (h) => h.jobStatus === 'demobilized',
          );

          dailyHours.push({
            date: dateStr,
            day,
            hoursWorked: 0,
            jobStatus: isDemobilizedFirstDay ? 'demobilized' : null,
            notes: null,
            entryId: null,
          });

          if (isDemobilizedFirstDay) {
            wasPreviouslyMobilized = false; // Reset flag after showing "Dem"
          }
        }
      }

      // Only include employee if they were mobilized to this project on at least one day
      const hasMobilizedDays = dailyHours.some(
        (d) => d.jobStatus && d.jobStatus !== 'demobilized',
      );
      if (hasMobilizedDays || dailyHours.length > 0) {
        employees.push({
          srNo: srNo++,
          employeeId: latestMob.employee.id,
          idNo: latestMob.employee.adaa_emp_code,
          name: latestMob.employee.name,
          trade: latestMob.mobilizedTrade?.skill || '',
          dailyHours,
        });
      }
    }

    return {
      timesheet: timesheet || null,
      project: {
        id: project.id,
        name: project.name,
        client: {
          id: project.client?.id || 0,
          name: project.client?.name || '',
        },
      },
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
      case 'on_vacation':
      case 'cancelled':
      case 'absconded':
      case 'absent':
      case 'sick_leave':
      case 'casual_leave':
      case 'resigned':
        return 0;
      case 'idle':
        return 8;
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
      // Check if entry exists
      let entry = await this.entryRepository.findOne({
        where: {
          timesheetId,
          employeeId: entryDto.employeeId,
          date: new Date(entryDto.date),
        },
      });

      if (entry) {
        // Update existing entry
        entry.hoursWorked = entryDto.hoursWorked;
        entry.jobStatus = entryDto.jobStatus;
        entry.notes = entryDto.notes || null;
        entry.tradeInSiteId = entryDto.tradeInSiteId || null;
        entry.updatedBy = updatedBy;
      } else {
        // Create new entry
        entry = this.entryRepository.create({
          timesheetId,
          employeeId: entryDto.employeeId,
          date: new Date(entryDto.date),
          hoursWorked: entryDto.hoursWorked,
          jobStatus: entryDto.jobStatus,
          notes: entryDto.notes,
          tradeInSiteId: entryDto.tradeInSiteId,
          createdBy: updatedBy,
        });
      }

      savedEntries.push(await this.entryRepository.save(entry));
    }

    return savedEntries;
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

    return await this.timesheetRepository.save(timesheet);
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
}
