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
import { ProjectSpecialDayRate } from '../projects/entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';
import { AllowanceDeductionExcelValidator } from './utils/allowance-deduction-excel-validator.util';

export interface ImportResult {
  success: boolean;
  message: string;
  updated: number;
  notFound: string[];
  errors: string[];
}

/** One calendar row for payroll; sourceProjectId applies project-specific rate overrides */
type PayrollComputationDay = {
  date: string;
  day: number;
  hoursWorked: number;
  isOffDay: boolean;
  jobStatus: string | null;
  notes: string | null;
  entryId?: number | null;
  sourceProjectId?: number;
};

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
    @InjectRepository(ProjectSpecialDayRate)
    private readonly projectSpecialDayRateRepository: Repository<ProjectSpecialDayRate>,
    @InjectRepository(ProjectRateVariantRate)
    private readonly projectRateVariantRateRepository: Repository<ProjectRateVariantRate>,
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
    const netSalary = this.calculateNetSalary(createPayrollDto);
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
    const netSalary = this.calculateNetSalary(payroll as any);
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
    await this.payrollRepository.delete(payroll.id);
  }

  async removeMany(ids: number[]): Promise<{ deleted: number }> {
    const result = await this.payrollRepository.delete(ids);
    return { deleted: result.affected || 0 };
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
    const projectIds = await this.getApprovedProjectIdsForMonth(month);
    if (projectIds.length === 0) {
      throw new BadRequestException(
        `No approved timesheets found for month ${month}`,
      );
    }

    const payrolls: Payroll[] = [];
    const seenPayrollIds = new Set<number>();

    const projectPayrolls = await this.savePayrollsFromConsolidatedMap(
      month,
      projectIds,
    );
    for (const p of projectPayrolls) {
      payrolls.push(p);
      seenPayrollIds.add(p.id);
    }

    const idlePayrolls = await this.calculatePayrollFromIdleTimesheet(month);
    for (const p of idlePayrolls) {
      if (!seenPayrollIds.has(p.id)) {
        payrolls.push(p);
        seenPayrollIds.add(p.id);
      }
    }

    return payrolls;
  }

  /**
   * Calculate payroll from the approved idle-employees timesheet.
   * For each employee with idle days: merge idle hours into existing payroll for the month, or create one if none exists.
   */
  async calculatePayrollFromIdleTimesheet(month: string): Promise<Payroll[]> {
    const timesheetData =
      await this.timesheetsService.getMonthlyIdleTimesheetData(month);

    if (!timesheetData.timesheet) {
      return [];
    }
    if (timesheetData.timesheet.status !== TimesheetStatus.APPROVED) {
      return [];
    }

    const payrolls: Payroll[] = [];

    for (const employee of timesheetData.employees) {
      try {
        const calculations = await this.calculateEmployeePayrollFromTimesheetData(
          employee.employeeId,
          employee.skillId,
          employee.dailyHours,
        );

        const existingPayroll = await this.payrollRepository.findOne({
          where: {
            employeeId: employee.employeeId,
            month,
          },
        });

        if (existingPayroll) {
          // Merge idle hours into existing payroll
          const existingBreakdown = existingPayroll.hoursBreakdown || {
            regular: [],
            specialDays: [],
            offDays: [],
            idle: [],
          };
          const mergedIdle: Array<{
            date: string;
            hours: number;
            additionalAmount: number;
            hourlyRate: number;
            amount: number;
          }> = [
            ...(existingBreakdown.idle || []),
            ...(calculations.hoursBreakdown.idle || []),
          ];
          const idleAmount = (calculations.hoursBreakdown.idle || []).reduce(
            (sum: number, row: any) => sum + (row.amount || 0),
            0,
          );

          existingPayroll.totalIdleDayHours =
            Number(existingPayroll.totalIdleDayHours) +
            Number(calculations.totalIdleDayHours);
          existingPayroll.totalHours =
            Number(existingPayroll.totalHours) +
            Number(calculations.totalIdleDayHours);
          existingPayroll.totalGrossSalary =
            Number(existingPayroll.totalGrossSalary) + idleAmount;
          existingPayroll.hoursBreakdown = {
            ...existingBreakdown,
            idle: mergedIdle,
          };
          existingPayroll.notes = [
            existingPayroll.notes,
            'Idle days from approved idle timesheet.',
          ]
            .filter(Boolean)
            .join(' ');

          const netSalary = this.calculateNetSalary(existingPayroll as any);
          existingPayroll.netSalary = netSalary;

          const updated = await this.payrollRepository.save(existingPayroll);
          payrolls.push(updated);
        } else {
          // No existing payroll: create one from idle only
          const payrollData: CreatePayrollDto = {
            employeeId: employee.employeeId,
            month,
            totalHours: calculations.totalIdleDayHours,
            totalOtHours: 0,
            totalOffdaysWorkedHours: 0,
            totalIdleDayHours: calculations.totalIdleDayHours,
            absentDaysDeductible: 0,
            hoursBreakdown: calculations.hoursBreakdown,
            baseHourlyRate: calculations.baseHourlyRate,
            totalGrossSalary: calculations.totalGrossSalary,
            notes: 'Calculated from approved idle timesheet.',
          };

          const payroll = await this.createOrUpdate(payrollData);
          payrolls.push(payroll);
        }
      } catch (error: any) {
        // Skip this employee but continue processing others
      }
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

    const projectIds = await this.getApprovedProjectIdsForMonth(month);
    return this.savePayrollsFromConsolidatedMap(month, projectIds);
  }

  /** Approved non-idle projects for payroll consolidation */
  private async getApprovedProjectIdsForMonth(month: string): Promise<number[]> {
    const rows = await this.timesheetRepository.find({
      where: { month, status: TimesheetStatus.APPROVED },
    });
    return [
      ...new Set(
        rows
          .map((r) => r.projectId)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
  }

  /**
   * When the same calendar day appears from multiple sources, keep one coherent row so
   * payroll is idempotent across re-runs and duplicate project passes do not inflate hours.
   */
  private accumulatePayrollDayForDate(
    byDate: Map<string, PayrollComputationDay>,
    projectId: number,
    day: {
      date: string;
      day: number;
      hoursWorked: number;
      jobStatus: string | null;
      isOffDay: boolean;
      notes: string | null;
      entryId?: number | null;
    },
  ): void {
    const next: PayrollComputationDay = {
      date: day.date,
      day: day.day,
      hoursWorked: Number(day.hoursWorked),
      jobStatus: day.jobStatus,
      isOffDay: day.isOffDay,
      notes: day.notes,
      entryId: day.entryId ?? null,
      sourceProjectId: projectId,
    };

    const prev = byDate.get(day.date);
    if (!prev) {
      byDate.set(day.date, next);
      return;
    }

    const ph = Number(prev.hoursWorked);
    const nh = Number(next.hoursWorked);
    const prevSt = (prev.jobStatus ?? '').toLowerCase();
    const nextSt = (next.jobStatus ?? '').toLowerCase();

    const sameSnapshot =
      Math.abs(ph - nh) < 1e-6 &&
      prevSt === nextSt &&
      prev.isOffDay === next.isOffDay;

    if (sameSnapshot) {
      return;
    }

    const prevHasEntry = prev.entryId != null;
    const nextHasEntry = next.entryId != null;

    if (nextHasEntry && !prevHasEntry) {
      byDate.set(day.date, next);
      return;
    }
    if (prevHasEntry && !nextHasEntry) {
      return;
    }

    if (nh > ph) {
      byDate.set(day.date, next);
    }
  }

  private async buildConsolidatedEmployeeDailyForMonth(
    month: string,
    projectIds: number[],
  ): Promise<{
    byEmployee: Map<
      number,
      {
        skillId: number;
        name: string;
        projectIds: Set<number>;
        dailyByDate: Map<string, PayrollComputationDay>;
      }
    >;
    projectNameById: Map<number, string>;
  }> {
    const byEmployee = new Map<
      number,
      {
        skillId: number;
        name: string;
        projectIds: Set<number>;
        dailyByDate: Map<string, PayrollComputationDay>;
      }
    >();
    const projectNameById = new Map<number, string>();

    for (const projectId of projectIds) {
      const data =
        await this.timesheetsService.getMonthlyProjectTimesheet(projectId, month);
      if (
        !data.timesheet ||
        data.timesheet.status !== TimesheetStatus.APPROVED
      ) {
        continue;
      }
      projectNameById.set(projectId, data.project.name);

      for (const emp of data.employees) {
        let row = byEmployee.get(emp.employeeId);
        if (!row) {
          row = {
            skillId: emp.skillId,
            name: emp.name,
            projectIds: new Set<number>(),
            dailyByDate: new Map<string, PayrollComputationDay>(),
          };
          byEmployee.set(emp.employeeId, row);
        }
        row.projectIds.add(projectId);
        for (const day of emp.dailyHours) {
          this.accumulatePayrollDayForDate(row.dailyByDate, projectId, day);
        }
      }
    }

    return { byEmployee, projectNameById };
  }

  private async savePayrollsFromConsolidatedMap(
    month: string,
    projectIds: number[],
  ): Promise<Payroll[]> {
    const { byEmployee, projectNameById } =
      await this.buildConsolidatedEmployeeDailyForMonth(month, projectIds);
    const payrolls: Payroll[] = [];

    for (const [employeeId, empRow] of byEmployee) {
      try {
        const dailyHours = [...empRow.dailyByDate.values()].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        if (dailyHours.length === 0) continue;

        const calculations = await this.calculateEmployeePayrollFromTimesheetData(
          employeeId,
          empRow.skillId,
          dailyHours,
        );

        const existingPayroll = await this.payrollRepository.findOne({
          where: { employeeId, month },
        });

        const missingRate = calculations.baseHourlyRate === 0;
        const projectNamesLabel = [...empRow.projectIds]
          .map((id) => projectNameById.get(id) || `Project #${id}`)
          .sort()
          .join(', ');
        const notePrefix = `Calculated from approved timesheets (projects: ${projectNamesLabel})`;
        const noteWarning = missingRate
          ? ` [Warning: No cost_price found for skill ${empRow.skillId}, using rate 0]`
          : '';

        const payrollData: CreatePayrollDto = {
          employeeId,
          month,
          totalHours: calculations.totalHours,
          totalOtHours: calculations.totalOtHours,
          totalOffdaysWorkedHours: calculations.totalOffdaysWorkedHours,
          totalIdleDayHours: calculations.totalIdleDayHours,
          absentDaysDeductible: calculations.absentDays,
          hoursBreakdown: calculations.hoursBreakdown,
          baseHourlyRate: calculations.baseHourlyRate,
          totalGrossSalary: calculations.totalGrossSalary,
          allowances: existingPayroll?.allowances || undefined,
          otherDeductions: existingPayroll?.otherDeductions || undefined,
          notes: notePrefix + noteWarning,
        };

        payrolls.push(await this.createOrUpdate(payrollData));
      } catch {
        continue;
      }
    }

    return payrolls;
  }

  /**
   * Get the base hourly rate for an employee from their first employee_skill record.
   * Returns 0 if no skill is assigned or cost_price is not set.
   */
  private async getEmployeeBaseRate(
    employeeId: number,
    _skillId?: number | null,
  ): Promise<number> {
    const employeeSkill = await this.employeeSkillRepository.findOne({
      where: { employeeId },
      order: { id: 'ASC' },
    });

    if (employeeSkill && employeeSkill.cost_price) {
      return Number(employeeSkill.cost_price);
    }

    return 0;
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
    projectId?: number,
  ): Promise<
    Array<{ variant: RateVariant | null; hours: number; variantName: string }>
  > {
    const allVariants = await this.rateVariantRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    // Exclude variants explicitly disabled for this project — their hours
    // fall through to the regular/base rate (same policy as invoicing).
    const disabledIds = projectId
      ? await this.getDisabledRateVariantIdsForProject(projectId)
      : new Set<number>();
    const rateVariants = allVariants.filter((v) => !disabledIds.has(v.id));

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
   * Check if a date is a special day (with premium or modified rates)
   */
  private async isSpecialDay(date: string): Promise<boolean> {
    const specialDay = await this.getSpecialDayForDate(date);
    return specialDay !== null;
  }

  /**
   * Calculate payroll metrics from the timesheet daily hours data with rate variants and special days
   * This uses the same data structure that's displayed in the UI
   *
   * Rate calculation logic:
   * - Base rate: employee_skill.cost_price (first assigned skill)
   * - For special days: hourlyRate = baseRate + specialDay.employeeAdditionalAmount
   * - For regular days: hourlyRate = baseRate + variant.employeeAdditionalAmount
   * - Sale price still uses clientRateMultiplier (multiplier, not flat)
   */
  private async calculateEmployeePayrollFromTimesheetData(
    employeeId: number,
    skillId: number | null | undefined,
    dailyHours: PayrollComputationDay[],
    projectId?: number,
  ) {
    let totalHours = 0;
    let totalOtHours = 0;
    let totalOffdaysWorkedHours = 0;
    let totalIdleDayHours = 0;
    let absentDays = 0;

    // Get base hourly rate for this employee
    const baseRate = await this.getEmployeeBaseRate(employeeId, skillId);

    // Detailed breakdown tracking (additionalAmount = flat AED/hr on top of baseRate)
    const regularHoursMap = new Map<
      string,
      { hours: number; additionalAmount: number }
    >();
    const specialDaysMap = new Map<
      string,
      { hours: number; additionalAmount: number }
    >();
    const offDaysBreakdown: Array<{
      date: string;
      hours: number;
      additionalAmount: number;
    }> = [];
    const idleDaysBreakdown: Array<{
      date: string;
      hours: number;
      additionalAmount: number;
    }> = [];

    // Get the "Project Off Day" variant
    const projectOffDayVariant = await this.getProjectOffDayVariant();
    const offDayAdditional = projectOffDayVariant
      ? Number(projectOffDayVariant.employeeAdditionalAmount)
      : 0;

    // Get the "Idle" variant
    const idleVariant = await this.getIdleVariant();
    const idleAdditional = idleVariant
      ? Number(idleVariant.employeeAdditionalAmount)
      : 0;

    for (const dayData of dailyHours) {
      const hours = Number(dayData.hoursWorked);
      const jobStatus = dayData.jobStatus?.toLowerCase() || '';
      const rateProjectId = dayData.sourceProjectId ?? projectId;

      // Handle idle days first (before checking demobilization)
      if (jobStatus === 'idle') {
        totalIdleDayHours += hours;
        idleDaysBreakdown.push({
          date: dayData.date,
          hours,
          additionalAmount: idleAdditional,
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

      // Check if this is a special day (honoring project-level disable flag).
      const specialDay = await this.getSpecialDayForDate(
        dayData.date,
        rateProjectId,
      );

      // If working on a special day
      if (specialDay && hours > 0) {
        const specialDayAdditional = Number(specialDay.employeeAdditionalAmount || 0);

        // Track by special day name (consolidate hours for the same special day)
        const existing = specialDaysMap.get(specialDay.name);
        if (existing) {
          existing.hours += hours;
        } else {
          specialDaysMap.set(specialDay.name, {
            hours,
            additionalAmount: specialDayAdditional,
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
          additionalAmount: offDayAdditional,
        });
        totalOffdaysWorkedHours += hours;
        continue;
      }

      // Regular working day (active, notice_period, etc.)
      if (hours > 0 && !isOffDay && !specialDay) {
        // Split hours across applicable rate variants.
        // Variants disabled for this project are skipped so their hours fall
        // through to the regular/base rate.
        const hoursSplit = await this.splitHoursAcrossRateVariants(
          hours,
          rateProjectId,
        );

        for (const { variant, hours: hoursForVariant } of hoursSplit) {
          const additionalAmount = variant
            ? Number(variant.employeeAdditionalAmount || 0)
            : 0;
          const rateVariantName = variant ? variant.name : 'Regular';

          // Track by rate variant
          const existing = regularHoursMap.get(rateVariantName);
          if (existing) {
            existing.hours += hoursForVariant;
          } else {
            regularHoursMap.set(rateVariantName, {
              hours: hoursForVariant,
              additionalAmount,
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

    // Build detailed breakdown with amounts (cost = (baseRate + additionalAmount) * hours)
    const hoursBreakdown = {
      regular: Array.from(regularHoursMap.entries()).map(([name, data]) => ({
        rateVariantName: name,
        hours: Math.round(data.hours * 100) / 100,
        additionalAmount: data.additionalAmount,
        hourlyRate: Math.round((baseRate + data.additionalAmount) * 100) / 100,
        amount:
          Math.round((baseRate + data.additionalAmount) * data.hours * 100) / 100,
      })),
      specialDays: Array.from(specialDaysMap.entries()).map(([name, data]) => ({
        specialDayName: name,
        hours: Math.round(data.hours * 100) / 100,
        additionalAmount: data.additionalAmount,
        hourlyRate: Math.round((baseRate + data.additionalAmount) * 100) / 100,
        amount:
          Math.round((baseRate + data.additionalAmount) * data.hours * 100) / 100,
      })),
      offDays: offDaysBreakdown.map((od) => ({
        date: od.date,
        hours: Math.round(od.hours * 100) / 100,
        additionalAmount: od.additionalAmount,
        hourlyRate: Math.round((baseRate + od.additionalAmount) * 100) / 100,
        amount: Math.round((baseRate + od.additionalAmount) * od.hours * 100) / 100,
      })),
      idle: idleDaysBreakdown.map((id) => ({
        date: id.date,
        hours: Math.round(id.hours * 100) / 100,
        additionalAmount: id.additionalAmount,
        hourlyRate: Math.round((baseRate + id.additionalAmount) * 100) / 100,
        amount: Math.round((baseRate + id.additionalAmount) * id.hours * 100) / 100,
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
   * Get the special day for a specific date (returns full special day entity).
   * When `projectId` is supplied, special days explicitly disabled for that
   * project (ProjectSpecialDayRate.isEnabled = false) are ignored.
   */
  private async getSpecialDayForDate(
    date: string,
    projectId?: number,
  ): Promise<SpecialDay | null> {
    const specialDays = await this.specialDayRepository.find({
      where: { isActive: true },
    });

    const disabledIds = projectId
      ? await this.getDisabledSpecialDayIdsForProject(projectId)
      : new Set<number>();

    for (const specialDay of specialDays) {
      if (disabledIds.has(specialDay.id)) continue;

      const targetDate = new Date(date);
      const start = new Date(specialDay.startDate);
      const end = specialDay.endDate ? new Date(specialDay.endDate) : start;

      if (targetDate >= start && targetDate <= end) {
        return specialDay;
      }
    }

    return null;
  }

  private async getDisabledSpecialDayIdsForProject(
    projectId: number,
  ): Promise<Set<number>> {
    const rows = await this.projectSpecialDayRateRepository.find({
      where: { projectId, isEnabled: false },
    });
    return new Set(rows.map((r) => r.specialDayId));
  }

  private async getDisabledRateVariantIdsForProject(
    projectId: number,
  ): Promise<Set<number>> {
    const rows = await this.projectRateVariantRateRepository.find({
      where: { projectId, isEnabled: false },
    });
    return new Set(rows.map((r) => r.rateVariantId));
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
        const netSalary = this.calculateNetSalary(payroll);
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
   * Calculate net salary from payroll data (hours-based only).
   * Fixed monthly salary (basic/HRA/other on employee) is not included — it is the 260h entitlement reference only.
   * Net Salary = Total Gross Salary (from hours) + Allowances - Deductions (from import).
   * `absentDaysDeductible` is stored for records only and does not reduce net pay.
   */
  private calculateNetSalary(
    payrollData: CreatePayrollDto | Payroll,
  ): number {
    const grossSalary = Number(payrollData.totalGrossSalary || 0);

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

    const netSalary = grossSalary + totalAllowances - totalDeductions;

    return Math.round(netSalary * 100) / 100; // Round to 2 decimal places
  }
}
