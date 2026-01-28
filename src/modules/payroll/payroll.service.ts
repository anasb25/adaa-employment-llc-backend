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
import { AllowanceDeductionExcelValidator } from './utils/allowance-deduction-excel-validator.util';

export interface ImportResult {
  success: boolean;
  message: string;
  updated: number;
  notFound: string[];
  errors: string[];
}

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

    // Calculate net salary before creating
    const netSalary = await this.calculateNetSalary(createPayrollDto);
    const payrollWithNetSalary = { ...createPayrollDto, netSalary };

    const payroll = this.payrollRepository.create(payrollWithNetSalary);
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

    // Merge the updates, but only for defined values
    // This prevents overwriting existing allowances/deductions with undefined
    Object.keys(updatePayrollDto).forEach((key) => {
      const value = updatePayrollDto[key];
      if (value !== undefined) {
        payroll[key] = value;
      }
    });

    // Recalculate net salary with updated values
    const netSalary = await this.calculateNetSalary(payroll as any);
    payroll.netSalary = netSalary;

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

      // Check if payroll already exists to preserve allowances/deductions
      const existingPayroll = await this.payrollRepository.findOne({
        where: {
          employeeId: employee.employeeId,
          month,
        },
      });

      const payrollData: CreatePayrollDto = {
        employeeId: employee.employeeId,
        month,
        totalHours: calculations.totalHours,
        totalOtHours: calculations.totalOtHours,
        totalOffdaysWorkedHours: calculations.totalOffdaysWorkedHours,
        totalIdleDayHours: calculations.totalIdleDayHours,
        absentDaysDeductible: calculations.absentDays,
        hoursBreakdown: calculations.hoursBreakdown,
        baseHourlyRate: calculations.baseHourlyRate,
        totalGrossSalary: calculations.totalGrossSalary,
        // Preserve existing allowances and deductions if they exist
        allowances: existingPayroll?.allowances || undefined,
        otherDeductions: existingPayroll?.otherDeductions || undefined,
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
   * Split hours across applicable rate variants
   * Returns an array of rate variants with the hours that apply to each
   *
   * Logic:
   * - maxHours: Variant applies ONLY if total hours <= maxHours (e.g., Half-day: ≤4 hours)
   * - minHours: Variant applies to hours ABOVE minHours (e.g., Overtime: >10 hours)
   * - No constraints: Base/Regular rate
   *
   * Examples:
   * - 4 hours worked with Half-day(maxHours=4): All 4 hours at Half-day rate
   * - 12 hours worked with Overtime(minHours=10): 10 at Regular + 2 at Overtime
   * - 6 hours worked: All at Regular rate
   */
  private async splitHoursAcrossRateVariants(
    hoursWorked: number,
  ): Promise<
    Array<{ variant: RateVariant | null; hours: number; variantName: string }>
  > {
    const rateVariants = await this.rateVariantRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    const result: Array<{
      variant: RateVariant | null;
      hours: number;
      variantName: string;
    }> = [];

    // Check if any range variant applies (e.g., Half-day with minHours=1, maxHours=4)
    // These apply to the ENTIRE day if total hours fall within the range
    for (const variant of rateVariants) {
      const maxHours =
        variant.maxHours !== null ? Number(variant.maxHours) : null;
      const minHours =
        variant.minHours !== null ? Number(variant.minHours) : null;

      // Check if this is a "range" variant (has maxHours, possibly with minHours as lower bound)
      if (maxHours !== null) {
        const lowerBound = minHours !== null ? minHours : 0;

        // If hours fall within the range, this variant applies to the whole day
        if (hoursWorked >= lowerBound && hoursWorked <= maxHours) {
          return [
            {
              variant,
              hours: hoursWorked,
              variantName: variant.name,
            },
          ];
        }
      }
    }

    // Check for minHours-only variants (e.g., Overtime with minHours=10, no maxHours)
    // These split the day: base hours up to threshold, then variant hours after
    const minHoursVariants = rateVariants.filter(
      (v) => v.minHours !== null && v.minHours > 0 && v.maxHours === null,
    );

    if (minHoursVariants.length > 0) {
      // Sort by minHours ascending
      minHoursVariants.sort((a, b) => Number(a.minHours) - Number(b.minHours));

      let currentHour = 0;

      for (const variant of minHoursVariants) {
        const threshold = Number(variant.minHours);

        if (hoursWorked > threshold) {
          // Add base/regular hours up to threshold (if any)
          if (currentHour < threshold) {
            const baseHours = threshold - currentHour;
            result.push({
              variant: null, // Regular/base rate
              hours: baseHours,
              variantName: 'Regular',
            });
            currentHour = threshold;
          }

          // Check if there's a next threshold
          const nextVariant = minHoursVariants.find(
            (v) => Number(v.minHours) > threshold,
          );
          const nextThreshold = nextVariant
            ? Number(nextVariant.minHours)
            : hoursWorked;

          // Hours for this variant
          const variantHours =
            Math.min(nextThreshold, hoursWorked) - currentHour;

          if (variantHours > 0) {
            result.push({
              variant,
              hours: variantHours,
              variantName: variant.name,
            });
            currentHour += variantHours;
          }
        }
      }

      // If there are remaining hours (shouldn't happen but just in case)
      if (currentHour < hoursWorked) {
        result.push({
          variant: null,
          hours: hoursWorked - currentHour,
          variantName: 'Regular',
        });
      }

      return result;
    }

    // No special variants apply, all hours at base/regular rate
    return [
      {
        variant: null,
        hours: hoursWorked,
        variantName: 'Regular',
      },
    ];
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

    // Detailed breakdown tracking
    const regularHoursMap = new Map<
      string,
      { hours: number; rateMultiplier: number }
    >();
    const specialDaysMap = new Map<
      string,
      { hours: number; rateMultiplier: number }
    >();
    const offDaysBreakdown: Array<{
      date: string;
      hours: number;
      rateMultiplier: number;
    }> = [];
    const idleDaysBreakdown: Array<{
      date: string;
      hours: number;
      rateMultiplier: number;
    }> = [];
    let idleMultiplier = 0.5; // Default to 50%

    // Get the "Project Off Day" variant
    const projectOffDayVariant = await this.getProjectOffDayVariant();
    const offDayMultiplier = projectOffDayVariant
      ? Number(projectOffDayVariant.employeeRateMultiplier)
      : 1.0;

    // Get the "Idle" variant
    const idleVariant = await this.getIdleVariant();
    idleMultiplier = idleVariant
      ? Number(idleVariant.employeeRateMultiplier)
      : 0.5;

    for (const dayData of dailyHours) {
      const hours = Number(dayData.hoursWorked);
      const jobStatus = dayData.jobStatus?.toLowerCase() || '';

      // Handle idle days first (before checking demobilization)
      if (jobStatus === 'idle') {
        totalIdleDayHours += hours;
        idleDaysBreakdown.push({
          date: dayData.date,
          hours,
          rateMultiplier: idleMultiplier,
        });
        continue;
      }

      // Skip if no job status (before mobilization or after demobilization)
      if (!jobStatus || jobStatus === 'demobilized') {
        continue;
      }

      // Annual leave is paid leave – do not count as deductible
      if (jobStatus === 'annual_leave') {
        continue;
      }

      // Count absent days (absent, sick leave, casual leave, urgent leave) – these are deductible
      if (
        jobStatus === 'absent' ||
        jobStatus === 'sick_leave' ||
        jobStatus === 'casual_leave' ||
        jobStatus === 'urgent_leave'
      ) {
        absentDays++;
        continue;
      }

      const isOffDay = dayData.isOffDay; // Project-specific off days (e.g., Friday, Saturday)

      // Check if this is a special day
      const specialDay = await this.getSpecialDayForDate(dayData.date);

      // If working on a special day
      if (specialDay && hours > 0) {
        const specialDayMultiplier = Number(specialDay.employeeRateMultiplier);

        // Track by special day name (consolidate hours for the same special day)
        const existing = specialDaysMap.get(specialDay.name);
        if (existing) {
          existing.hours += hours;
        } else {
          specialDaysMap.set(specialDay.name, {
            hours,
            rateMultiplier: specialDayMultiplier,
          });
        }

        totalOffdaysWorkedHours += hours;
        continue;
      }

      // If working on an off day (but not a special day)
      if (isOffDay && hours > 0) {
        offDaysBreakdown.push({
          date: dayData.date,
          hours,
          rateMultiplier: offDayMultiplier,
        });
        totalOffdaysWorkedHours += hours;
        continue;
      }

      // Regular working day (active, notice_period, etc.)
      if (hours > 0 && !isOffDay && !specialDay) {
        // Split hours across applicable rate variants
        const hoursSplit = await this.splitHoursAcrossRateVariants(hours);

        for (const { variant, hours: hoursForVariant } of hoursSplit) {
          const rateMultiplier = variant
            ? Number(variant.employeeRateMultiplier)
            : 1.0;
          const rateVariantName = variant ? variant.name : 'Regular';

          // Track by rate variant
          const existing = regularHoursMap.get(rateVariantName);
          if (existing) {
            existing.hours += hoursForVariant;
          } else {
            regularHoursMap.set(rateVariantName, {
              hours: hoursForVariant,
              rateMultiplier,
            });
          }

          // Track for totals (distinguish overtime from regular)
          if (variant && variant.minHours !== null && variant.minHours > 0) {
            // This is overtime (hours above a threshold)
            totalOtHours += hoursForVariant;
          } else {
            // Regular hours
            totalHours += hoursForVariant;
          }
        }
      }
    }

    // Build detailed breakdown with amounts
    const hoursBreakdown = {
      regular: Array.from(regularHoursMap.entries()).map(([name, data]) => ({
        rateVariantName: name,
        hours: Math.round(data.hours * 100) / 100,
        rateMultiplier: data.rateMultiplier,
        hourlyRate: Math.round(baseRate * data.rateMultiplier * 100) / 100,
        amount:
          Math.round(baseRate * data.rateMultiplier * data.hours * 100) / 100,
      })),
      specialDays: Array.from(specialDaysMap.entries()).map(([name, data]) => ({
        specialDayName: name,
        hours: Math.round(data.hours * 100) / 100,
        rateMultiplier: data.rateMultiplier,
        hourlyRate: Math.round(baseRate * data.rateMultiplier * 100) / 100,
        amount:
          Math.round(baseRate * data.rateMultiplier * data.hours * 100) / 100,
      })),
      offDays: offDaysBreakdown.map((od) => ({
        date: od.date,
        hours: Math.round(od.hours * 100) / 100,
        rateMultiplier: od.rateMultiplier,
        hourlyRate: Math.round(baseRate * od.rateMultiplier * 100) / 100,
        amount: Math.round(baseRate * od.rateMultiplier * od.hours * 100) / 100,
      })),
      idle: idleDaysBreakdown.map((id) => ({
        date: id.date,
        hours: Math.round(id.hours * 100) / 100,
        rateMultiplier: id.rateMultiplier,
        hourlyRate: Math.round(baseRate * id.rateMultiplier * 100) / 100,
        amount: Math.round(baseRate * id.rateMultiplier * id.hours * 100) / 100,
      })),
    };

    // Calculate total gross salary
    const totalGrossSalary =
      hoursBreakdown.regular.reduce((sum, r) => sum + r.amount, 0) +
      hoursBreakdown.specialDays.reduce((sum, sd) => sum + sd.amount, 0) +
      hoursBreakdown.offDays.reduce((sum, od) => sum + od.amount, 0) +
      hoursBreakdown.idle.reduce((sum, id) => sum + id.amount, 0);

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalOtHours: Math.round(totalOtHours * 100) / 100,
      totalOffdaysWorkedHours: Math.round(totalOffdaysWorkedHours * 100) / 100,
      totalIdleDayHours: Math.round(totalIdleDayHours * 100) / 100,
      absentDays: Math.round(absentDays * 100) / 100,
      hoursBreakdown,
      baseHourlyRate: baseRate,
      totalGrossSalary: Math.round(totalGrossSalary * 100) / 100,
    };
  }

  /**
   * Get the special day for a specific date (returns full special day entity)
   */
  private async getSpecialDayForDate(date: string): Promise<SpecialDay | null> {
    const specialDays = await this.specialDayRepository.find({
      where: { isActive: true },
    });

    for (const specialDay of specialDays) {
      const targetDate = new Date(date);
      const start = new Date(specialDay.startDate);
      const end = specialDay.endDate ? new Date(specialDay.endDate) : start;

      if (targetDate >= start && targetDate <= end) {
        return specialDay;
      }
    }

    return null;
  }

  /**
   * Get the "Project Off Day" variant
   */
  private async getProjectOffDayVariant(): Promise<RateVariant | null> {
    return await this.rateVariantRepository.findOne({
      where: { name: 'Project Off Day', isSystem: true },
    });
  }

  /**
   * Get the "Idle" variant
   */
  private async getIdleVariant(): Promise<RateVariant | null> {
    return await this.rateVariantRepository.findOne({
      where: { name: 'Idle', isSystem: true },
    });
  }

  /**
   * Import allowances and deductions from Excel file
   */
  async importAllowancesDeductions(
    fileBuffer: Buffer,
    month: string,
  ): Promise<ImportResult> {
    // Validate and parse the Excel file
    const validation =
      AllowanceDeductionExcelValidator.validateAndParseExcelFile(fileBuffer);

    if (!validation.isValid || !validation.data) {
      return {
        success: false,
        message: 'Validation failed',
        updated: 0,
        notFound: [],
        errors: validation.errors,
      };
    }

    const notFoundEmployees: string[] = [];
    const errors: string[] = [];
    let updatedCount = 0;

    // Process each employee's allowances/deductions
    for (const employeeData of validation.data) {
      try {
        // Find employee by adaa_emp_code (ID NO)
        const employee = await this.payrollRepository.manager
          .getRepository('employees')
          .findOne({
            where: { adaa_emp_code: employeeData.employeeId },
          });

        if (!employee) {
          notFoundEmployees.push(employeeData.employeeId);
          continue;
        }

        // Find existing payroll for this employee and month
        let payroll = await this.payrollRepository.findOne({
          where: {
            employeeId: employee.id,
            month,
          },
        });

        if (!payroll) {
          // Create a new payroll entry if it doesn't exist
          payroll = this.payrollRepository.create({
            employeeId: employee.id,
            month,
            totalHours: 0,
            totalOtHours: 0,
            totalOffdaysWorkedHours: 0,
            totalIdleDayHours: 0,
            absentDaysDeductible: 0,
            allowances: {},
            otherDeductions: {},
            baseHourlyRate: 0,
            totalGrossSalary: 0,
          });
        }

        // Convert allowances array to object format
        const allowancesObj: Record<string, number> = {};
        employeeData.allowances.forEach((allowance) => {
          allowancesObj[allowance.name] = allowance.value;
        });

        // Convert deductions array to object format
        const deductionsObj: Record<string, number> = {};
        employeeData.deductions.forEach((deduction) => {
          deductionsObj[deduction.name] = deduction.value;
        });

        // Update allowances and deductions
        payroll.allowances = allowancesObj;
        payroll.otherDeductions = deductionsObj;

        // Recalculate net salary with updated allowances and deductions
        const netSalary = await this.calculateNetSalary(payroll);
        payroll.netSalary = netSalary;

        await this.payrollRepository.save(payroll);
        updatedCount++;
      } catch (error: any) {
        errors.push(
          `Error processing employee ${employeeData.employeeId}: ${error.message}`,
        );
      }
    }

    return {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? `Successfully updated ${updatedCount} payroll records`
          : `Updated ${updatedCount} records with ${errors.length} errors`,
      updated: updatedCount,
      notFound: notFoundEmployees,
      errors,
    };
  }

  /**
   * Generate Excel template for allowances/deductions import
   */
  generateAllowancesDeductionsTemplate(): Buffer {
    return AllowanceDeductionExcelValidator.generateTemplate();
  }

  /**
   * Calculate net salary from payroll data
   * Net Salary = Total Gross Salary + Employee Salary Components + Allowances - Deductions - Absent Days Deductible
   * Employee Salary Components = Basic Salary + HRA + Other Allowance
   */
  private async calculateNetSalary(
    payrollData: CreatePayrollDto | Payroll,
  ): Promise<number> {
    const grossSalary = Number(payrollData.totalGrossSalary || 0);

    // Fetch employee data to get salary components
    const employee = await this.payrollRepository.manager
      .getRepository('employees')
      .findOne({
        where: { id: payrollData.employeeId },
      });

    // Calculate employee fixed salary components
    let employeeSalaryComponents = 0;
    if (employee) {
      const basicSalary = Number(employee.basic_salary || 0);
      const hra = Number(employee.hra || 0);
      const otherAllowance = Number(employee.other_allowance || 0);
      employeeSalaryComponents = basicSalary + hra + otherAllowance;
    }

    // Calculate total allowances from payroll
    let totalAllowances = 0;
    if (payrollData.allowances) {
      totalAllowances = Object.values(payrollData.allowances).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      );
    }

    // Calculate total deductions
    let totalDeductions = 0;
    if (payrollData.otherDeductions) {
      totalDeductions = Object.values(payrollData.otherDeductions).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      );
    }

    // Add absent days deductible to deductions
    const absentDaysDeductible = Number(payrollData.absentDaysDeductible || 0);

    // Calculate net salary
    const netSalary =
      grossSalary +
      employeeSalaryComponents +
      totalAllowances -
      totalDeductions -
      absentDaysDeductible;

    return Math.round(netSalary * 100) / 100; // Round to 2 decimal places
  }
}
