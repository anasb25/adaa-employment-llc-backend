import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreateInvoiceDto, GenerateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto, MarkAsPaidDto } from './dto/update-invoice.dto';
import { InvoiceFiltersDto } from './dto/invoice-filters.dto';
import { Project } from '../projects/entities/project.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { ProjectSkill } from '../project-skills/entities/project-skill.entity';
import { Skill } from '../skills/entities/skill.entity';
import { ProjectSpecialDayRate } from '../projects/entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';
import { TimesheetsService } from '../timesheets/timesheets.service';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { formatDateOnly } from '../../common/utils/date.util';
import * as numberToWords from 'number-to-words';

// Constants for ADAA company
const ADAA_COMPANY_NAME = 'ADAA EMPLOYMENT L.L.C';
const ADAA_ADDRESS = 'Dubai\nU.A.E';
const ADAA_TRN = '100476365000003';
const TAX_RATE = 0.05; // 5% VAT

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetEntry)
    private readonly entryRepository: Repository<TimesheetEntry>,
    @InjectRepository(RateVariant)
    private readonly rateVariantRepository: Repository<RateVariant>,
    @InjectRepository(SpecialDay)
    private readonly specialDayRepository: Repository<SpecialDay>,
    @InjectRepository(ProjectSkill)
    private readonly projectSkillRepository: Repository<ProjectSkill>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(ProjectSpecialDayRate)
    private readonly projectSpecialDayRateRepository: Repository<ProjectSpecialDayRate>,
    @InjectRepository(ProjectRateVariantRate)
    private readonly projectRateVariantRateRepository: Repository<ProjectRateVariantRate>,
    private readonly timesheetsService: TimesheetsService,
  ) {}

  /**
   * Get all invoices with filters and pagination
   */
  async findAll(
    filters: InvoiceFiltersDto,
  ): Promise<PaginatedResponse<Invoice>> {
    const page = parseInt(filters.page || '1', 10);
    const limit = parseInt(filters.limit || '10', 10);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Invoice> = {};

    if (filters.projectId) {
      where.projectId = parseInt(filters.projectId, 10);
    }

    if (filters.month) {
      where.month = filters.month;
    }

    if (filters.status) {
      where.status = filters.status as InvoiceStatus;
    }

    if (filters.invoiceNumber) {
      where.invoiceNumber = Like(`%${filters.invoiceNumber}%`);
    }

    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where,
      relations: ['project', 'project.client'],
      order: { invoiceDate: 'DESC', invoiceNumber: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: invoices,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Get invoice by ID
   */
  async findOne(id: number): Promise<Invoice> {
    const invoice = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.project', 'project')
      .leftJoinAndSelect('project.client', 'client')
      .where('invoice.id = :id', { id })
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Generate invoice number
   * Format: ADAA-XXXX (starting from 0001)
   */
  private async generateInvoiceNumber(): Promise<string> {
    const lastInvoice = await this.invoiceRepository.find({
      order: { invoiceNumber: 'DESC' },
      take: 1,
    });

    let nextNumber = 1;
    if (lastInvoice.length > 0 && lastInvoice[0].invoiceNumber) {
      const match = lastInvoice[0].invoiceNumber.match(/ADAA-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `ADAA-${String(nextNumber).padStart(4, '0')}`;
  }

  /**
   * Generate invoice from timesheet data
   * This is the main method that calculates invoice based on timesheets with client rates
   */
  async generateInvoice(
    dto: GenerateInvoiceDto,
    createdBy: number,
  ): Promise<Invoice> {
    const { projectId, month } = dto;

    // Check if invoice already exists
    const existing = await this.invoiceRepository.findOne({
      where: { projectId, month },
    });

    if (existing) {
      throw new ConflictException(
        `Invoice for project ${projectId} and month ${month} already exists`,
      );
    }

    // Get project with client
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['client'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get timesheet data for the month
    const timesheetData =
      await this.timesheetsService.getMonthlyProjectTimesheet(projectId, month);

    if (!timesheetData.employees || timesheetData.employees.length === 0) {
      throw new BadRequestException(
        'No timesheet data found for this project and month',
      );
    }

    // Calculate line items grouped by skill
    const lineItems = await this.calculateLineItems(
      project,
      timesheetData.employees,
    );

    // Calculate totals
    const totalTaxableAmount = lineItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );
    const totalTax = Math.round(totalTaxableAmount * TAX_RATE * 100) / 100;
    const totalAmount = Math.round((totalTaxableAmount + totalTax) * 100) / 100;

    // Generate invoice number
    const invoiceNumber =
      dto.invoiceNumber || (await this.generateInvoiceNumber());

    // Calculate dates
    const invoiceDate = new Date();
    const paymentTermsDays = project.client?.paymentTerms
      ? parseInt(project.client.paymentTerms, 10)
      : 30;
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);

    // Generate subject
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1)
      .toLocaleString('en-US', { month: 'short' })
      .toUpperCase();
    const subject = `ADAA MANPOWER LABOR SUPPLY SERVICES FOR THE MONTH OF ${monthName}-${year}`;

    // Create invoice
    const invoice = this.invoiceRepository.create({
      invoiceNumber,
      projectId,
      month,
      invoiceDate,
      dueDate,
      subject,
      lineItems,
      totalTaxableAmount,
      totalTax,
      totalAmount,
      totalInWords: this.convertAmountToWords(Number(totalAmount)),
      status: InvoiceStatus.DRAFT,
      createdBy,
    });

    return await this.invoiceRepository.save(invoice);
  }

  /**
   * Calculate line items grouped by skill with rate variants
   */
  private async calculateLineItems(
    project: Project,
    employees: Array<{
      skillId: number;
      trade: string;
      dailyHours: Array<{
        date: string;
        hoursWorked: number;
        jobStatus: string | null;
        isOffDay: boolean;
      }>;
    }>,
  ): Promise<
    Array<{
      skillName: string;
      skillId: number;
      rateVariants: Array<{
        variantName: string;
        hours: number;
        ratePerHour: number;
        taxPercentage: number;
        taxAmount: number;
        amount: number;
      }>;
      subtotal: number;
    }>
  > {
    // Group employees by skill
    const skillGroups = new Map<number, typeof employees>();
    for (const employee of employees) {
      const existing = skillGroups.get(employee.skillId) || [];
      existing.push(employee);
      skillGroups.set(employee.skillId, existing);
    }

    const lineItems: Array<{
      skillName: string;
      skillId: number;
      rateVariants: Array<{
        variantName: string;
        hours: number;
        ratePerHour: number;
        taxPercentage: number;
        taxAmount: number;
        amount: number;
      }>;
      subtotal: number;
    }> = [];

    // Process each skill group
    for (const [skillId, skillEmployees] of skillGroups.entries()) {
      const skill = await this.skillRepository.findOne({
        where: { id: skillId },
      });

      if (!skill) continue;

      // Collect all hours by rate variant for this skill
      const rateVariantHours = new Map<
        string,
        { hours: number; variantId: number | null; multiplier: number }
      >();

      // Get client rate for this skill on this project
      const baseClientRate = await this.getSkillClientRate(project.id, skillId);

      if (baseClientRate === null) {
        // Skip if no client rate configured
        continue;
      }

      // Process each employee's hours
      for (const employee of skillEmployees) {
        for (const dayData of employee.dailyHours) {
          const hours = Number(dayData.hoursWorked);
          const jobStatus = dayData.jobStatus?.toLowerCase() || '';

          // Skip if no hours or if demobilized/leave/absent/idle
          if (
            hours <= 0 ||
            !jobStatus ||
            jobStatus === 'demobilized' ||
            jobStatus === 'annual_leave' ||
            jobStatus === 'absent' ||
            jobStatus === 'sick_leave' ||
            jobStatus === 'casual_leave' ||
            jobStatus === 'urgent_leave' ||
            jobStatus === 'idle'
          ) {
            continue;
          }

          const isOffDay = dayData.isOffDay;

          // Check if this is a special day (honoring project-level disable).
          const specialDay = await this.getSpecialDayForDate(
            dayData.date,
            project.id,
          );

          // If working on a special day (special days take precedence)
          if (specialDay && hours > 0) {
            const multiplier = await this.getSpecialDayClientMultiplier(
              project.id,
              specialDay.id,
              specialDay.clientRateMultiplier,
            );
            const billedHours = this.getSpecialDayBilledHours(specialDay, hours);
            const key = specialDay.name;
            const existing = rateVariantHours.get(key);
            if (existing) {
              existing.hours += billedHours;
            } else {
              rateVariantHours.set(key, {
                hours: billedHours,
                variantId: null,
                multiplier,
              });
            }
            continue;
          }

          // If working on an off day (but not a special day)
          if (isOffDay && hours > 0) {
            const offDayMultiplier = Number(project.offDayMultiplier) || 1.0;
            const key = 'Project Off Day';
            const existing = rateVariantHours.get(key);
            if (existing) {
              existing.hours += hours;
            } else {
              rateVariantHours.set(key, {
                hours,
                variantId: null,
                multiplier: offDayMultiplier,
              });
            }
            continue;
          }

          // Regular working day - split THIS DAY'S hours across rate variants.
          // Any variant explicitly disabled for this project is skipped so its
          // hours are billed at the regular base rate instead.
          if (hours > 0 && !isOffDay && !specialDay) {
            const hoursSplit = await this.splitHoursAcrossRateVariants(
              hours,
              project.id,
            );

            for (const { variant, hours: hoursForVariant } of hoursSplit) {
              const multiplier = variant
                ? await this.getRateVariantClientMultiplier(
                    project.id,
                    variant.id,
                    variant.clientRateMultiplier,
                  )
                : 1.0;
              const key = variant ? variant.name : 'Regular';

              const existing = rateVariantHours.get(key);
              if (existing) {
                existing.hours += hoursForVariant;
              } else {
                rateVariantHours.set(key, {
                  hours: hoursForVariant,
                  variantId: variant?.id || null,
                  multiplier,
                });
              }
            }
          }
        }
      }

      // Build rate variants array for this skill
      const rateVariants: Array<{
        variantName: string;
        hours: number;
        ratePerHour: number;
        taxPercentage: number;
        taxAmount: number;
        amount: number;
      }> = [];
      let skillSubtotal = 0;

      for (const [variantName, data] of rateVariantHours.entries()) {
        const ratePerHour =
          Math.round(baseClientRate * data.multiplier * 100) / 100;
        const amount = Math.round(data.hours * ratePerHour * 100) / 100;
        const taxAmount = Math.round(amount * TAX_RATE * 100) / 100;

        rateVariants.push({
          variantName,
          hours: Math.round(data.hours * 100) / 100,
          ratePerHour,
          taxPercentage: TAX_RATE * 100,
          taxAmount,
          amount,
        });

        skillSubtotal += amount;
      }

      if (rateVariants.length > 0) {
        lineItems.push({
          skillName: skill.skill,
          skillId: skill.id,
          rateVariants,
          subtotal: Math.round(skillSubtotal * 100) / 100,
        });
      }
    }

    return lineItems;
  }

  /**
   * Get client rate for a skill on a project
   */
  private async getSkillClientRate(
    projectId: number,
    skillId: number,
  ): Promise<number | null> {
    // First check project-specific rate
    const projectSkill = await this.projectSkillRepository.findOne({
      where: { projectId, skillId },
    });

    if (projectSkill && projectSkill.sale_price) {
      return Number(projectSkill.sale_price);
    }

    // Fall back to default skill rate
    const skill = await this.skillRepository.findOne({
      where: { id: skillId },
    });

    if (skill && skill.sale_price) {
      return Number(skill.sale_price);
    }

    return null;
  }

  /**
   * Get special day client multiplier (project-specific or global)
   */
  private async getSpecialDayClientMultiplier(
    projectId: number,
    specialDayId: number,
    globalMultiplier: number,
  ): Promise<number> {
    const projectRate = await this.projectSpecialDayRateRepository.findOne({
      where: { projectId, specialDayId },
    });

    if (projectRate) {
      return Number(projectRate.clientRateMultiplier);
    }

    return Number(globalMultiplier) || 1.0;
  }

  /**
   * Get rate variant client multiplier (project-specific or global)
   */
  private async getRateVariantClientMultiplier(
    projectId: number,
    rateVariantId: number,
    globalMultiplier: number,
  ): Promise<number> {
    const projectRate = await this.projectRateVariantRateRepository.findOne({
      where: { projectId, rateVariantId },
    });

    if (projectRate) {
      return Number(projectRate.clientRateMultiplier);
    }

    return Number(globalMultiplier) || 1.0;
  }

  /**
   * Split hours across applicable rate variants
   * Returns an array of rate variants with the hours that apply to each
   *
   * Logic (same as payroll):
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
  ): Promise<Array<{ variant: RateVariant | null; hours: number }>> {
    const allVariants = await this.rateVariantRepository.find({
      where: { isActive: true },
      order: { displayOrder: 'ASC' },
    });

    // Exclude any rate variant that has been explicitly disabled for this
    // project. A disabled variant must not participate in the split at all —
    // the hours it would have claimed fall through to the regular/base rate.
    const disabledIds = projectId
      ? await this.getDisabledRateVariantIdsForProject(projectId)
      : new Set<number>();
    const rateVariants = allVariants.filter((v) => !disabledIds.has(v.id));

    const result: Array<{ variant: RateVariant | null; hours: number }> = [];

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
          return [{ variant, hours: hoursWorked }];
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
        });
      }

      return result;
    }

    // No special variants apply, all hours at base/regular rate
    return [{ variant: null, hours: hoursWorked }];
  }

  /**
   * Calculate billed hours for a special day (per employee, per day).
   * If the special day has billing rules configured:
   *   actual ≤ threshold → bill minBillingHours
   *   actual > threshold → bill actual + additionalHoursAboveThreshold
   * Otherwise returns actual hours unchanged.
   */
  private getSpecialDayBilledHours(
    specialDay: SpecialDay,
    actualHours: number,
  ): number {
    const threshold = specialDay.billingHoursThreshold;
    const minBilling = specialDay.minBillingHours;
    const additionalAbove = specialDay.additionalHoursAboveThreshold;

    if (threshold == null || minBilling == null) {
      return actualHours;
    }

    if (actualHours <= Number(threshold)) {
      return Number(minBilling);
    }

    const extra = additionalAbove != null ? Number(additionalAbove) : 0;
    return actualHours + extra;
  }

  /**
   * Get the special day matching a specific date, optionally honoring the
   * project-level disable flag. When `projectId` is supplied and the project
   * has a ProjectSpecialDayRate row with `isEnabled = false` for the matching
   * special day, this returns `null` — i.e. the special day is treated as
   * non-existent for that project.
   */
  private async getSpecialDayForDate(
    date: string,
    projectId?: number,
  ): Promise<SpecialDay | null> {
    const specialDays = await this.specialDayRepository.find({
      where: { isActive: true },
    });

    // Pre-compute the set of disabled special-day IDs for this project so the
    // per-day loop stays cheap.
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
   * Convert amount to words (AED)
   * Example: 45670.80 -> "AED Forty-Five Thousand Six Hundred Seventy and Eighty Fils"
   */
  private convertAmountToWords(amount: number): string {
    const dirham = Math.floor(amount);
    const fils = Math.round((amount - dirham) * 100);

    const amountToTitleCaseWords = (n: number): string =>
      numberToWords
        .toWords(n)
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    const dirhamWords = amountToTitleCaseWords(dirham);

    if (fils > 0) {
      return `AED ${dirhamWords} and ${amountToTitleCaseWords(fils)} Fils`;
    }
    return `AED ${dirhamWords} Only`;
  }

  /**
   * Update invoice
   */
  async update(
    id: number,
    dto: UpdateInvoiceDto,
    updatedBy: number,
  ): Promise<Invoice> {
    const invoice = await this.findOne(id);

    Object.assign(invoice, dto);
    invoice.updatedBy = updatedBy;

    // Recalculate totals if line items changed
    if (dto.lineItems) {
      const totalTaxableAmount = invoice.lineItems.reduce(
        (sum, item) => sum + item.subtotal,
        0,
      );
      invoice.totalTaxableAmount = totalTaxableAmount;
      invoice.totalTax = Math.round(totalTaxableAmount * TAX_RATE * 100) / 100;
      invoice.totalAmount =
        Math.round((totalTaxableAmount + invoice.totalTax) * 100) / 100;
      invoice.totalInWords = this.convertAmountToWords(invoice.totalAmount);
    }

    return await this.invoiceRepository.save(invoice);
  }

  /**
   * Approve invoice
   */
  async approve(id: number, approvedBy: number): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.PENDING
    ) {
      throw new BadRequestException(
        'Only draft or pending invoices can be approved',
      );
    }

    invoice.status = InvoiceStatus.APPROVED;
    invoice.approvedBy = approvedBy;
    invoice.approvedDate = new Date();
    invoice.updatedBy = approvedBy;

    return await this.invoiceRepository.save(invoice);
  }

  /**
   * Mark invoice as sent
   */
  async markAsSent(id: number, updatedBy: number): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved invoices can be marked as sent',
      );
    }

    invoice.status = InvoiceStatus.SENT;
    invoice.sentDate = new Date();
    invoice.updatedBy = updatedBy;

    return await this.invoiceRepository.save(invoice);
  }

  /**
   * Mark invoice as paid
   */
  async markAsPaid(
    id: number,
    dto: MarkAsPaidDto,
    updatedBy: number,
  ): Promise<Invoice> {
    const invoice = await this.findOne(id);

    invoice.status = InvoiceStatus.PAID;
    invoice.paidDate = new Date(dto.paidDate);
    invoice.paymentReference = dto.paymentReference ?? null;
    invoice.updatedBy = updatedBy;

    return await this.invoiceRepository.save(invoice);
  }

  /**
   * Delete invoice
   */
  async remove(id: number): Promise<void> {
    const invoice = await this.findOne(id);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot delete paid invoices');
    }

    await this.invoiceRepository.remove(invoice);
  }

  async removeMany(ids: number[]): Promise<{ deleted: number; skipped: number }> {
    const invoices = await this.invoiceRepository.find({
      where: ids.map((id) => ({ id })),
    });

    const deletable = invoices.filter(
      (inv) => inv.status !== InvoiceStatus.PAID,
    );
    const skipped = invoices.length - deletable.length;

    if (deletable.length > 0) {
      await this.invoiceRepository.remove(deletable);
    }

    return { deleted: deletable.length, skipped };
  }
}
