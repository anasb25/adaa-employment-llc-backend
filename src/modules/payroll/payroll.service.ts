import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Payroll } from './entities/payroll.entity';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { PayrollFiltersDto } from './dto/payroll-filters.dto';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';
import { Timesheet, TimesheetStatus } from '../timesheets/entities/timesheet.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { Project } from '../projects/entities/project.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepository: Repository<Payroll>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetEntry)
    private readonly timesheetEntryRepository: Repository<TimesheetEntry>,
    @InjectRepository(Mobilization)
    private readonly mobilizationRepository: Repository<Mobilization>,
    @InjectRepository(SpecialDay)
    private readonly specialDayRepository: Repository<SpecialDay>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  /**
   * Get all payrolls with optional filters and pagination
   */
  async findAll(filters: PayrollFiltersDto): Promise<PaginatedResponse<Payroll>> {
    const { month, employeeId, page = 1, limit = 10 } = filters;

    const queryBuilder = this.payrollRepository
      .createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.employee', 'employee')
      .orderBy('payroll.month', 'DESC')
      .addOrderBy('employee.name', 'ASC');

    if (month) {
      queryBuilder.andWhere('payroll.month = :month', { month });
    }

    if (employeeId) {
      queryBuilder.andWhere('payroll.employeeId = :employeeId', { employeeId });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return PaginationUtil.createPaginatedResponse(data, total, page, limit);
  }

  /**
   * Get payrolls for a specific month
   */
  async findByMonth(month: string): Promise<Payroll[]> {
    return await this.payrollRepository.find({
      where: { month },
      relations: ['employee'],
      order: { employeeId: 'ASC' },
    });
  }

  /**
   * Get payroll by ID
   */
  async findOne(id: number): Promise<Payroll> {
    const payroll = await this.payrollRepository.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!payroll) {
      throw new NotFoundException(`Payroll with ID ${id} not found`);
    }

    return payroll;
  }

  /**
   * Get payroll for a specific employee and month
   */
  async findByEmployeeAndMonth(
    employeeId: number,
    month: string,
  ): Promise<Payroll | null> {
    return await this.payrollRepository.findOne({
      where: { employeeId, month },
      relations: ['employee'],
    });
  }

  /**
   * Create a new payroll entry
   */
  async create(createPayrollDto: CreatePayrollDto): Promise<Payroll> {
    // Check if payroll already exists for this employee and month
    const existingPayroll = await this.findByEmployeeAndMonth(
      createPayrollDto.employeeId,
      createPayrollDto.month,
    );

    if (existingPayroll) {
      throw new BadRequestException(
        `Payroll already exists for employee ${createPayrollDto.employeeId} in month ${createPayrollDto.month}`,
      );
    }

    const payroll = this.payrollRepository.create(createPayrollDto);
    return await this.payrollRepository.save(payroll);
  }

  /**
   * Update an existing payroll entry
   */
  async update(id: number, updatePayrollDto: UpdatePayrollDto): Promise<Payroll> {
    const payroll = await this.findOne(id);

    Object.assign(payroll, updatePayrollDto);
    return await this.payrollRepository.save(payroll);
  }

  /**
   * Create or update payroll (upsert)
   */
  async createOrUpdate(createPayrollDto: CreatePayrollDto): Promise<Payroll> {
    const existingPayroll = await this.findByEmployeeAndMonth(
      createPayrollDto.employeeId,
      createPayrollDto.month,
    );

    if (existingPayroll) {
      return await this.update(existingPayroll.id, createPayrollDto);
    }

    return await this.create(createPayrollDto);
  }

  /**
   * Delete a payroll entry
   */
  async remove(id: number): Promise<void> {
    const payroll = await this.findOne(id);
    await this.payrollRepository.softDelete(payroll.id);
  }

  /**
   * Bulk create or update payrolls for a month
   */
  async bulkCreateOrUpdate(payrolls: CreatePayrollDto[]): Promise<Payroll[]> {
    const results: Payroll[] = [];

    for (const payrollDto of payrolls) {
      const result = await this.createOrUpdate(payrollDto);
      results.push(result);
    }

    return results;
  }

  /**
   * Calculate payroll for a specific month based on approved timesheets
   * This will process all approved timesheets for the month and generate payroll entries
   */
  async calculatePayrollForMonth(month: string): Promise<Payroll[]> {
    // Get all approved timesheets for the month
    const approvedTimesheets = await this.timesheetRepository.find({
      where: {
        month,
        status: TimesheetStatus.APPROVED,
      },
      relations: ['entries', 'entries.employee', 'project'],
    });

    if (approvedTimesheets.length === 0) {
      throw new BadRequestException(
        `No approved timesheets found for month ${month}`,
      );
    }

    // Get date range for the month
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    // Get special days for the month
    const specialDays = await this.specialDayRepository.find({
      where: {
        startDate: Between(startDate, endDate),
        isActive: true,
      },
    });

    // Create a map to check if a date is a special day (off day)
    const specialDayMap = new Map<string, boolean>();
    specialDays.forEach((sd) => {
      const dateStr = this.formatDate(sd.startDate);
      // Consider it an off day if it's marked as default off or optional/mandatory off
      specialDayMap.set(dateStr, sd.isDefaultOff);
    });

    // Group entries by employee
    const employeeEntriesMap = new Map<number, TimesheetEntry[]>();
    approvedTimesheets.forEach((timesheet) => {
      timesheet.entries.forEach((entry) => {
        if (!employeeEntriesMap.has(entry.employeeId)) {
          employeeEntriesMap.set(entry.employeeId, []);
        }
        employeeEntriesMap.get(entry.employeeId)!.push(entry);
      });
    });

    // Get mobilizations for the month to determine idle days
    const mobilizations = await this.mobilizationRepository.find({
      where: {
        actionDate: Between(startDate, endDate),
      },
    });

    // Group mobilizations by employee
    const employeeMobilizationsMap = new Map<number, Mobilization[]>();
    mobilizations.forEach((mob) => {
      if (!employeeMobilizationsMap.has(mob.employeeId)) {
        employeeMobilizationsMap.set(mob.employeeId, []);
      }
      employeeMobilizationsMap.get(mob.employeeId)!.push(mob);
    });

    // Calculate payroll for each employee
    const payrolls: Payroll[] = [];

    for (const [employeeId, entries] of employeeEntriesMap.entries()) {
      const calculations = this.calculateEmployeePayroll(
        entries,
        employeeMobilizationsMap.get(employeeId) || [],
        specialDayMap,
      );

      const payrollData: CreatePayrollDto = {
        employeeId,
        month,
        totalHours: calculations.totalHours,
        totalOtHours: calculations.totalOtHours,
        totalOffdaysWorkedHours: calculations.totalOffdaysWorkedHours,
        totalIdleDayHours: calculations.totalIdleDayHours,
        absentDaysDeductible: calculations.absentDays,
        allowances: undefined,
        arrears: undefined,
        otherDeductions: undefined,
        notes: `Auto-calculated from approved timesheets`,
      };

      const payroll = await this.createOrUpdate(payrollData);
      payrolls.push(payroll);
    }

    return payrolls;
  }

  /**
   * Calculate payroll metrics for a single employee
   */
  private calculateEmployeePayroll(
    entries: TimesheetEntry[],
    mobilizations: Mobilization[],
    specialDayMap: Map<string, boolean>,
  ) {
    let totalHours = 0;
    let totalOtHours = 0;
    let totalOffdaysWorkedHours = 0;
    let totalIdleDayHours = 0;
    let absentDays = 0;

    // Create a map of date to mobilization status for idle day detection
    const mobilizationStatusMap = new Map<string, string>();
    mobilizations.forEach((mob) => {
      const dateStr = this.formatDate(mob.actionDate);
      mobilizationStatusMap.set(dateStr, mob.jobStatus);
    });

    entries.forEach((entry) => {
      const entryDateStr = this.formatDate(entry.date);
      const hours = Number(entry.hoursWorked);
      const jobStatus = entry.jobStatus.toLowerCase();

      // Check if this is a special/off day
      const isOffDay = specialDayMap.get(entryDateStr) || false;
      const dayOfWeek = new Date(entry.date).getDay();
      const isFriday = dayOfWeek === 5; // Friday is typically an off day

      // Check if employee was marked as idle in mobilization
      const mobStatus = mobilizationStatusMap.get(entryDateStr);
      const isIdleFromMobilization = mobStatus === 'idle';

      // Count absent days (absent, sick leave, casual leave, on_vacation)
      if (
        jobStatus === 'absent' ||
        jobStatus === 'sick_leave' ||
        jobStatus === 'casual_leave' ||
        jobStatus === 'on_vacation'
      ) {
        absentDays++;
        return; // Skip further processing for absent days
      }

      // Skip demobilized status
      if (jobStatus === 'demobilized') {
        return;
      }

      // Handle idle days - from timesheet or mobilization status
      if (jobStatus === 'idle' || isIdleFromMobilization) {
        // For idle status, count the hours as idle day hours
        totalIdleDayHours += hours;
        return;
      }

      // If working on an off day (Friday or special day)
      if ((isFriday || isOffDay) && hours > 0) {
        totalOffdaysWorkedHours += hours;
        return;
      }

      // Regular working day
      if (hours > 0) {
        // Regular hours: up to 10 hours
        const regularHours = Math.min(hours, 10);
        totalHours += regularHours;

        // OT hours: anything above 10 hours
        if (hours > 10) {
          const otHours = hours - 10;
          totalOtHours += otHours;
        }
      }
    });

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalOtHours: Math.round(totalOtHours * 100) / 100,
      totalOffdaysWorkedHours: Math.round(totalOffdaysWorkedHours * 100) / 100,
      totalIdleDayHours: Math.round(totalIdleDayHours * 100) / 100,
      absentDays: Math.round(absentDays * 100) / 100,
    };
  }

  /**
   * Helper to format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calculate payroll for a specific project and month
   */
  async calculatePayrollForProject(
    projectId: number,
    month: string,
  ): Promise<Payroll[]> {
    // Get approved timesheet for the project and month
    const timesheet = await this.timesheetRepository.findOne({
      where: {
        projectId,
        month,
        status: TimesheetStatus.APPROVED,
      },
      relations: ['entries', 'entries.employee'],
    });

    if (!timesheet) {
      throw new NotFoundException(
        `No approved timesheet found for project ${projectId} in month ${month}`,
      );
    }

    // Get date range for the month
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    // Get special days for the month
    const specialDays = await this.specialDayRepository.find({
      where: {
        startDate: Between(startDate, endDate),
        isActive: true,
      },
    });

    const specialDayMap = new Map<string, boolean>();
    specialDays.forEach((sd) => {
      const dateStr = this.formatDate(sd.startDate);
      specialDayMap.set(dateStr, sd.isDefaultOff);
    });

    // Get mobilizations for the employees in this timesheet
    const employeeIds = [
      ...new Set(timesheet.entries.map((e) => e.employeeId)),
    ];
    const mobilizations = await this.mobilizationRepository.find({
      where: {
        actionDate: Between(startDate, endDate),
      },
    });

    const relevantMobilizations = mobilizations.filter((m) =>
      employeeIds.includes(m.employeeId),
    );

    // Group entries by employee
    const employeeEntriesMap = new Map<number, TimesheetEntry[]>();
    timesheet.entries.forEach((entry) => {
      if (!employeeEntriesMap.has(entry.employeeId)) {
        employeeEntriesMap.set(entry.employeeId, []);
      }
      employeeEntriesMap.get(entry.employeeId)!.push(entry);
    });

    // Group mobilizations by employee
    const employeeMobilizationsMap = new Map<number, Mobilization[]>();
    relevantMobilizations.forEach((mob) => {
      if (!employeeMobilizationsMap.has(mob.employeeId)) {
        employeeMobilizationsMap.set(mob.employeeId, []);
      }
      employeeMobilizationsMap.get(mob.employeeId)!.push(mob);
    });

    // Calculate payroll for each employee
    const payrolls: Payroll[] = [];

    for (const [employeeId, entries] of employeeEntriesMap.entries()) {
      const calculations = this.calculateEmployeePayroll(
        entries,
        employeeMobilizationsMap.get(employeeId) || [],
        specialDayMap,
      );

      const payrollData: CreatePayrollDto = {
        employeeId,
        month,
        totalHours: calculations.totalHours,
        totalOtHours: calculations.totalOtHours,
        totalOffdaysWorkedHours: calculations.totalOffdaysWorkedHours,
        totalIdleDayHours: calculations.totalIdleDayHours,
        absentDaysDeductible: calculations.absentDays,
        allowances: undefined,
        arrears: undefined,
        otherDeductions: undefined,
        notes: `Calculated from approved timesheet for project ${projectId}`,
      };

      const payroll = await this.createOrUpdate(payrollData);
      payrolls.push(payroll);
    }

    return payrolls;
  }
}

