import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payroll } from './entities/payroll.entity';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { PayrollFiltersDto } from './dto/payroll-filters.dto';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';
import {
  Timesheet,
  TimesheetStatus,
} from '../timesheets/entities/timesheet.entity';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { Project } from '../projects/entities/project.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepository: Repository<Payroll>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly timesheetsService: TimesheetsService,
  ) {}

  /**
   * Get all payrolls with optional filters and pagination
   */
  async findAll(
    filters: PayrollFiltersDto,
  ): Promise<PaginatedResponse<Payroll>> {
    const { month, employeeId, page = 1, limit = 10 } = filters;

    // Build where conditions
    const where: any = {};
    if (month) {
      where.month = month;
    }
    if (employeeId) {
      where.employeeId = employeeId;
    }

    return await PaginationUtil.paginate(
      this.payrollRepository,
      { page, limit },
      {
        where,
        relations: ['employee'],
        order: { month: 'DESC', employeeId: 'ASC' },
      },
    );
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
  async update(
    id: number,
    updatePayrollDto: UpdatePayrollDto,
  ): Promise<Payroll> {
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
   * Uses the same timesheet data structure that displays correctly in the UI
   */
  async calculatePayrollForMonth(month: string): Promise<Payroll[]> {
    // Get all approved timesheets for the month
    const approvedTimesheets = await this.timesheetRepository.find({
      where: {
        month,
        status: TimesheetStatus.APPROVED,
      },
      relations: ['project'],
    });

    if (approvedTimesheets.length === 0) {
      throw new BadRequestException(
        `No approved timesheets found for month ${month}`,
      );
    }

    const payrolls: Payroll[] = [];

    // Process each approved timesheet (project)
    for (const timesheet of approvedTimesheets) {
      const projectPayrolls = await this.calculatePayrollForProject(
        timesheet.projectId,
        month,
      );
      payrolls.push(...projectPayrolls);
    }

    return payrolls;
  }

  /**
   * Calculate payroll for a specific project and month
   * Uses the existing getMonthlyProjectTimesheet which has correct carry-forward logic
   */
  async calculatePayrollForProject(
    projectId: number,
    month: string,
  ): Promise<Payroll[]> {
    // Use the existing timesheet service to get the properly formatted data with carry-forward
    const timesheetData =
      await this.timesheetsService.getMonthlyProjectTimesheet(projectId, month);

    if (!timesheetData.timesheet) {
      throw new NotFoundException(
        `No timesheet found for project ${projectId} in month ${month}`,
      );
    }

    if (timesheetData.timesheet.status !== TimesheetStatus.APPROVED) {
      throw new BadRequestException(
        `Timesheet for project ${projectId} in month ${month} is not approved`,
      );
    }

    const payrolls: Payroll[] = [];

    // Calculate payroll for each employee using the timesheet data
    for (const employee of timesheetData.employees) {
      const calculations = this.calculateEmployeePayrollFromTimesheetData(
        employee.dailyHours,
      );

      const payrollData: CreatePayrollDto = {
        employeeId: employee.employeeId,
        month,
        totalHours: calculations.totalHours,
        totalOtHours: calculations.totalOtHours,
        totalOffdaysWorkedHours: calculations.totalOffdaysWorkedHours,
        totalIdleDayHours: calculations.totalIdleDayHours,
        absentDaysDeductible: calculations.absentDays,
        allowances: undefined,
        arrears: undefined,
        otherDeductions: undefined,
        notes: `Calculated from approved timesheet for project ${timesheetData.project.name}`,
      };

      const payroll = await this.createOrUpdate(payrollData);
      payrolls.push(payroll);
    }

    return payrolls;
  }

  /**
   * Calculate payroll metrics from the timesheet daily hours data
   * This uses the same data structure that's displayed in the UI
   */
  private calculateEmployeePayrollFromTimesheetData(
    dailyHours: Array<{
      date: string;
      day: number;
      hoursWorked: number;
      isOffDay: boolean;
      jobStatus: string | null;
      notes: string | null;
    }>,
  ) {
    let totalHours = 0;
    let totalOtHours = 0;
    let totalOffdaysWorkedHours = 0;
    let totalIdleDayHours = 0;
    let absentDays = 0;

    dailyHours.forEach((dayData) => {
      const hours = Number(dayData.hoursWorked);
      const jobStatus = dayData.jobStatus?.toLowerCase() || '';

      // Skip if no job status (before mobilization or after demobilization)
      if (!jobStatus || jobStatus === 'demobilized') {
        return;
      }

      // Count absent days (absent, sick leave, casual leave, on_vacation)
      if (
        jobStatus === 'absent' ||
        jobStatus === 'sick_leave' ||
        jobStatus === 'casual_leave'
      ) {
        absentDays++;
        return;
      }

      // Handle idle days
      if (jobStatus === 'idle') {
        totalIdleDayHours += hours;
        return;
      }

      // Check if it's a Friday or off day
      const date = new Date(dayData.date);
      const dayOfWeek = date.getDay();

      const isOffDay = dayData.isOffDay;

      // If working on an off day (Friday or marked as off)
      if (isOffDay && hours > 0) {
        totalOffdaysWorkedHours += hours;
        return;
      }

      // Regular working day (active, notice_period, etc.)
      if (hours > 0 && !isOffDay) {
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
}
