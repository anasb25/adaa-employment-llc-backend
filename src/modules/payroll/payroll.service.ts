import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
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
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import { Skill } from '../skills/entities/skill.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private readonly payrollRepository: Repository<Payroll>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
    @InjectRepository(SpecialDay)
    private readonly specialDayRepository: Repository<SpecialDay>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
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
      const calculations = await this.calculateEmployeePayrollFromTimesheetData(
        employee.employeeId,
        employee.skillId,
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
   * Get the base hourly rate for an employee
   * Priority: employee_skill.cost_price > skill.cost_price
   */
  private async getEmployeeBaseRate(
    employeeId: number,
    skillId: number,
  ): Promise<number> {
    // First, try to get employee-specific rate
    const employeeSkill = await this.employeeSkillRepository.findOne({
      where: { employeeId, skillId },
    });

    if (employeeSkill && employeeSkill.cost_price) {
      return Number(employeeSkill.cost_price);
    }

    // Fallback to skill's base cost_price
    const skill = await this.skillRepository.findOne({
      where: { id: skillId },
    });

    if (skill && skill.cost_price) {
      return Number(skill.cost_price);
    }

    throw new BadRequestException(
      `No cost_price found for employee ${employeeId} and skill ${skillId}`,
    );
  }

  /**
   * Get the applicable rate variant based on hours worked
   * Returns the rate variant with matching hour range, or null if none match
   */
  private async getApplicableRateVariant(
    hoursWorked: number,
  ): Promise<RateVariant | null> {
    const rateVariants = await this.rateVariantRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    // Find the rate variant that matches the hour range
    for (const variant of rateVariants) {
      const minHours =
        variant.minHours !== null ? Number(variant.minHours) : null;
      const maxHours =
        variant.maxHours !== null ? Number(variant.maxHours) : null;

      // Check if hours fall within the range
      const meetsMin = minHours === null || hoursWorked >= minHours;
      const meetsMax = maxHours === null || hoursWorked <= maxHours;

      if (meetsMin && meetsMax) {
        return variant;
      }
    }

    // If no specific variant matches, return a default with 1.0 multiplier
    return null;
  }

  /**
   * Check if a date is a special day and return the employee rate multiplier
   * Returns the multiplier (default 1.0 if not a special day)
   */
  private async getSpecialDayMultiplier(date: string): Promise<number> {
    // Find all active special days
    const specialDays = await this.specialDayRepository.find({
      where: { isActive: true },
    });

    // Check if date falls within any special day
    for (const specialDay of specialDays) {
      const targetDate = new Date(date);
      const start = new Date(specialDay.startDate);
      const end = specialDay.endDate ? new Date(specialDay.endDate) : start;

      if (targetDate >= start && targetDate <= end) {
        return Number(specialDay.employeeRateMultiplier || 1.0);
      }
    }

    return 1.0; // No special day, return base multiplier
  }

  /**
   * Check if a date is a special day (with premium rates)
   */
  private async isSpecialDay(date: string): Promise<boolean> {
    const multiplier = await this.getSpecialDayMultiplier(date);
    return multiplier !== 1.0;
  }

  /**
   * Calculate payroll metrics from the timesheet daily hours data with rate variants and special days
   * This uses the same data structure that's displayed in the UI
   *
   * Rate calculation logic:
   * - Base rate: employee_skill.cost_price OR skill.cost_price
   * - For special days: Apply special day employee multiplier ONLY (no rate variants)
   * - For regular days: Apply rate variant employee multiplier based on hours worked
   */
  private async calculateEmployeePayrollFromTimesheetData(
    employeeId: number,
    skillId: number,
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

    // Get base hourly rate for this employee
    const baseRate = await this.getEmployeeBaseRate(employeeId, skillId);

    for (const dayData of dailyHours) {
      const hours = Number(dayData.hoursWorked);
      const jobStatus = dayData.jobStatus?.toLowerCase() || '';

      // Skip if no job status (before mobilization or after demobilization)
      if (!jobStatus || jobStatus === 'demobilized') {
        continue;
      }

      // Count absent days (absent, sick leave, casual leave, on_vacation)
      if (
        jobStatus === 'absent' ||
        jobStatus === 'sick_leave' ||
        jobStatus === 'casual_leave'
      ) {
        absentDays++;
        continue;
      }

      // Handle idle days
      if (jobStatus === 'idle') {
        totalIdleDayHours += hours;
        continue;
      }

      const isOffDay = dayData.isOffDay; // Project-specific off days (e.g., Friday, Saturday)

      // Check if this is a special day
      const isSpecial = await this.isSpecialDay(dayData.date);

      // If working on an off day (project-specific off days) OR special day
      if ((isOffDay || isSpecial) && hours > 0) {
        // For special days, use special day multiplier (not rate variants)
        if (isSpecial) {
          const specialDayMultiplier = await this.getSpecialDayMultiplier(
            dayData.date,
          );
          // Track as special day hours with multiplier applied
          totalOffdaysWorkedHours += hours;
        } else {
          // Regular off day (based on project's offDays configuration)
          totalOffdaysWorkedHours += hours;
        }
        continue;
      }

      // Regular working day (active, notice_period, etc.)
      if (hours > 0 && !isOffDay && !isSpecial) {
        // Get applicable rate variant based on hours worked
        const rateVariant = await this.getApplicableRateVariant(hours);
        const rateMultiplier = rateVariant
          ? Number(rateVariant.employeeRateMultiplier)
          : 1.0;

        // Apply rate variant logic based on hour ranges
        if (rateVariant && rateVariant.minHours !== null) {
          // This is an overtime/extra hours variant (e.g., >10 hours)
          const minHours = Number(rateVariant.minHours);
          if (hours > minHours) {
            // Regular hours: up to the threshold
            const regularHours = minHours;
            totalHours += regularHours;

            // OT hours: anything above the threshold with multiplier
            const otHours = hours - minHours;
            totalOtHours += otHours;
          } else {
            // All hours are regular
            totalHours += hours;
          }
        } else if (rateVariant && rateVariant.maxHours !== null) {
          // This is a reduced hours variant (e.g., half-day: 1-4 hours)
          const maxHours = Number(rateVariant.maxHours);
          if (hours <= maxHours) {
            // Apply the special rate for these hours
            totalHours += hours;
          } else {
            // Shouldn't exceed maxHours, but count as regular if it does
            totalHours += hours;
          }
        } else {
          // No hour constraints, regular hours
          totalHours += hours;
        }
      }
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalOtHours: Math.round(totalOtHours * 100) / 100,
      totalOffdaysWorkedHours: Math.round(totalOffdaysWorkedHours * 100) / 100,
      totalIdleDayHours: Math.round(totalIdleDayHours * 100) / 100,
      absentDays: Math.round(absentDays * 100) / 100,
    };
  }
}
