import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import {
  Mobilization,
  JobStatus,
} from '../mobilizations/entities/mobilization.entity';
import { MobilizationsService } from '../mobilizations/mobilizations.service';
import {
  TimesheetsService,
  TimesheetInsightMixRow,
} from '../timesheets/timesheets.service';
import { Project } from '../projects/entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import {
  Timesheet,
  TimesheetStatus,
} from '../timesheets/entities/timesheet.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { Payroll } from '../payroll/entities/payroll.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import {
  Settlement,
  SettlementStatus,
} from '../settlements/entities/settlement.entity';
import { DashboardStats } from './dashboard-stats.interface';
import { ADAA_SUPPLIER_NAME } from '../../common/constants/supplier.constants';
import { MobilizationExcelUtil } from '../mobilizations/utils/mobilization-excel.util';
import { resolveCountryFromNationality } from './utils/nationality-country.util';
import { formatDateOnly, parseDateOnly } from '../../common/utils/date.util';

export interface ExpiringDocument {
  field: string;
  label: string;
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface WorkforceInsightRow {
  label: string;
  count: number;
  percent: number;
  hours: number;
  hoursPercent: number;
}

export interface ClientFatInsightRow {
  client: string;
  adaa: number;
  adaaHours: number;
  clientFat: number;
  clientHours: number;
  total: number;
  totalHours: number;
}

export interface StatusInsightRow {
  label: string;
  count: number;
  hours: number;
}

export interface IdleTradeInsightRow {
  trade: string;
  count: number;
  hours: number;
}

export interface CountryInsightRow {
  country: string;
  isoCode: string | null;
  lat: number | null;
  lng: number | null;
  count: number;
  percent: number;
  hours: number;
  hoursPercent: number;
}

export interface MonthlyMoneyInsightRow {
  month: string;
  label: string;
  headcount: number;
  hours: number;
  amount: number;
}

export interface ExpiryInsightBucket {
  visa: number;
  eid: number;
  workPermit: number;
  passport: number;
  total: number;
}

export interface WorkforceInsights {
  asOf: string;
  periodStart: string;
  periodEnd: string;
  period: 'month' | 'year';
  total: number;
  totalHours: number;
  fat: WorkforceInsightRow[];
  trades: WorkforceInsightRow[];
  clients: WorkforceInsightRow[];
  clientsByFat: ClientFatInsightRow[];
  fatTotals: { adaa: number; client: number; adaaHours: number; clientHours: number };
  idleByTrade: IdleTradeInsightRow[];
  idleTotals: { count: number; hours: number };
  status: StatusInsightRow[];
  countries: CountryInsightRow[];
  monthlyPayroll: MonthlyMoneyInsightRow[];
  expiry: {
    next15: ExpiryInsightBucket;
    oneMonth: ExpiryInsightBucket;
  };
}

export interface EmployeeWithExpiringDocs {
  id: number;
  adaa_emp_code: string;
  name: string;
  contact_no: string | null;
  expiringDocuments: ExpiringDocument[];
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Employee)
    private employeesRepository: Repository<Employee>,
    @InjectRepository(Mobilization)
    private mobilizationRepository: Repository<Mobilization>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Timesheet)
    private timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetEntry)
    private timesheetEntryRepository: Repository<TimesheetEntry>,
    @InjectRepository(Payroll)
    private payrollRepository: Repository<Payroll>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Settlement)
    private settlementRepository: Repository<Settlement>,
    private mobilizationsService: MobilizationsService,
    private timesheetsService: TimesheetsService,
  ) {}

  /**
   * Employees whose effective (non day-specific) job status is cancelled or
   * absconded must not appear in document expiry alerts / insight buckets.
   * Day-specific rows (absent, sick leave, etc.) must not override a prior
   * cancelled/absconded status for this purpose.
   */
  private async getExpiryAlertExcludedEmployeeIds(): Promise<number[]> {
    const daySpecificStatuses = [
      JobStatus.ABSENT,
      JobStatus.SICK_LEAVE,
      JobStatus.CASUAL_LEAVE,
      JobStatus.URGENT_LEAVE,
      JobStatus.OFF,
    ];
    const excludedStatuses = new Set<string>([
      JobStatus.CANCELLED,
      JobStatus.ABSCONDED,
    ]);

    const rows = await this.mobilizationRepository
      .createQueryBuilder('mob')
      .select('mob.employeeId', 'employeeId')
      .addSelect('mob.jobStatus', 'jobStatus')
      .distinctOn(['mob.employeeId'])
      .where('mob.deletedAt IS NULL')
      .andWhere('mob.jobStatus NOT IN (:...daySpecificStatuses)', {
        daySpecificStatuses,
      })
      .orderBy('mob.employeeId', 'ASC')
      .addOrderBy('mob.actionDate', 'DESC')
      .addOrderBy('mob.id', 'DESC')
      .getRawMany<{ employeeId?: number; employeeid?: number; jobStatus?: string; jobstatus?: string }>();

    return rows
      .filter((row) => {
        const status = String(row.jobStatus ?? row.jobstatus ?? '').toLowerCase();
        return excludedStatuses.has(status);
      })
      .map((row) => Number(row.employeeId ?? row.employeeid))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  async getEmployeesWithExpiringDocuments(): Promise<
    EmployeeWithExpiringDocs[]
  > {
    // Get current date and date 15 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999); // End of the 15th day

    const excludedIds = await this.getExpiryAlertExcludedEmployeeIds();

    // Get all employees, excluding cancelled/absconded (effective status)
    const queryBuilder = this.employeesRepository
      .createQueryBuilder('employee')
      .select([
        'employee.id',
        'employee.adaa_emp_code',
        'employee.name',
        'employee.contact_no',
        'employee.pp_expiry',
        'employee.emirates_id_expiry',
        'employee.visa_expiry',
        'employee.work_permit_expiry',
      ])
      .where('employee.deletedAt IS NULL');

    if (excludedIds.length > 0) {
      queryBuilder.andWhere('employee.id NOT IN (:...excludedIds)', {
        excludedIds,
      });
    }

    const employees = await queryBuilder.getMany();

    const employeesWithExpiringDocs: EmployeeWithExpiringDocs[] = [];

    // Check each employee for expiring documents
    for (const employee of employees) {
      const expiringDocuments: ExpiringDocument[] = [];

      // Define document fields to check
      const documentsToCheck = [
        { field: 'pp_expiry', label: 'Passport', value: employee.pp_expiry },
        {
          field: 'emirates_id_expiry',
          label: 'Emirates ID',
          value: employee.emirates_id_expiry,
        },
        { field: 'visa_expiry', label: 'Visa', value: employee.visa_expiry },
        {
          field: 'work_permit_expiry',
          label: 'Work Permit',
          value: employee.work_permit_expiry,
        },
      ];

      for (const doc of documentsToCheck) {
        // Skip if document expiry date is null or empty
        if (!doc.value || doc.value.trim() === '') {
          continue;
        }

        try {
          // Parse the expiry date
          const expiryDate = new Date(doc.value);

          // Validate the date
          if (isNaN(expiryDate.getTime())) {
            console.warn(
              `Invalid date for ${doc.label} of employee ${employee.adaa_emp_code}: ${doc.value}`,
            );
            continue;
          }

          expiryDate.setHours(0, 0, 0, 0);

          // Calculate days until expiry (negative if already expired)
          const daysUntilExpiry = Math.ceil(
            (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          );

          // Include documents that are expired or expiring within the next 15 days
          if (daysUntilExpiry <= 15) {
            expiringDocuments.push({
              field: doc.field,
              label: doc.label,
              expiryDate: doc.value,
              daysUntilExpiry,
            });
          }
        } catch (error) {
          console.error(
            `Error processing ${doc.label} expiry for employee ${employee.adaa_emp_code}:`,
            error,
          );
          continue;
        }
      }

      // If employee has any expiring documents, add them to the result
      if (expiringDocuments.length > 0) {
        employeesWithExpiringDocs.push({
          id: employee.id,
          adaa_emp_code: employee.adaa_emp_code,
          name: employee.name,
          contact_no: employee.contact_no,
          expiringDocuments: expiringDocuments.sort(
            (a, b) => a.daysUntilExpiry - b.daysUntilExpiry,
          ),
        });
      }
    }

    // Sort employees by the most urgent expiration (lowest daysUntilExpiry, expired first)
    employeesWithExpiringDocs.sort((a, b) => {
      const minDaysA = Math.min(
        ...a.expiringDocuments.map((d) => d.daysUntilExpiry),
      );
      const minDaysB = Math.min(
        ...b.expiringDocuments.map((d) => d.daysUntilExpiry),
      );
      return minDaysA - minDaysB;
    });

    // Sort documents within each employee (expired first, then by urgency)
    employeesWithExpiringDocs.forEach((employee) => {
      employee.expiringDocuments.sort(
        (a, b) => a.daysUntilExpiry - b.daysUntilExpiry,
      );
    });

    return employeesWithExpiringDocs;
  }

  /**
   * Export today's workforce snapshot in mobilization import format.
   * Row count matches dashboard Active Workforce total (effective status per employee).
   */
  async exportActiveWorkforce(): Promise<Buffer> {
    const today = new Date();
    const effectiveMobilizations =
      await this.mobilizationsService.getEffectiveStatusForAllEmployeesOnDate(
        today,
      );

    const snapshotDate = formatDateOnly(today);
    const rowsForExport = effectiveMobilizations.map((mob) => ({
      ...mob,
      actionDate: snapshotDate,
    }));

    return MobilizationExcelUtil.generateImportFormatExport(rowsForExport);
  }

  async getDashboardStats(month?: string): Promise<DashboardStats> {
    const now = new Date();
    const resolvedMonth =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [
      employees,
      projects,
      clients,
      expiringDocuments,
      effectiveMobilizations,
      timesheetRows,
      payrollRows,
      invoiceRows,
      settlementRows,
      payrollTrendRows,
      supplierEmployeeRows,
    ] = await Promise.all([
      this.employeesRepository.count({ where: { deletedAt: IsNull() } }),
      this.projectRepository.count({ where: { deletedAt: IsNull() } }),
      this.clientRepository.count({ where: { deletedAt: IsNull() } }),
      this.getEmployeesWithExpiringDocuments(),
      this.mobilizationsService.getEffectiveStatusForAllEmployeesOnDate(now),
      this.timesheetRepository
        .createQueryBuilder('t')
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('t.month = :month', { month: resolvedMonth })
        .andWhere('t.deletedAt IS NULL')
        .groupBy('t.status')
        .getRawMany<{ status: string; count: string }>(),
      this.payrollRepository
        .createQueryBuilder('p')
        .innerJoin('p.employee', 'e')
        .innerJoin('e.supplier', 's')
        .select('COUNT(*)', 'records')
        .addSelect('COALESCE(SUM(p.totalHours), 0)', 'totalHours')
        .addSelect('COALESCE(SUM(p.totalGrossSalary), 0)', 'totalGross')
        .addSelect('COALESCE(SUM(p.netSalary), 0)', 'totalNet')
        .where('p.month = :month', { month: resolvedMonth })
        .andWhere('p.deletedAt IS NULL')
        .andWhere('s.name = :adaaSupplier', { adaaSupplier: ADAA_SUPPLIER_NAME })
        .getRawOne<{
          records: string;
          totalHours: string;
          totalGross: string;
          totalNet: string;
        }>(),
      this.invoiceRepository.find({
        where: { month: resolvedMonth, deletedAt: IsNull() },
        select: ['id', 'status', 'totalAmount'],
      }),
      this.settlementRepository.find({
        where: { deletedAt: IsNull() },
        select: ['id', 'status'],
      }),
      this.getPayrollTrend(6),
      this.getEmployeesBySupplier(),
    ]);

    const leaveStatuses = new Set([
      JobStatus.ABSENT,
      JobStatus.SICK_LEAVE,
      JobStatus.CASUAL_LEAVE,
      JobStatus.URGENT_LEAVE,
      JobStatus.ANNUAL_LEAVE,
    ]);
    const terminalStatuses = new Set([
      JobStatus.CANCELLED,
      JobStatus.ABSCONDED,
      JobStatus.RESIGNED,
    ]);

    const workforceByStatusMap = new Map<string, number>();
    let active = 0;
    let idle = 0;
    let onLeave = 0;
    let off = 0;
    let other = 0;
    const projectHeadcount = new Map<
      number,
      { projectName: string; headcount: number }
    >();

    for (const mob of effectiveMobilizations) {
      const status = String(mob.jobStatus || 'active').toLowerCase();
      workforceByStatusMap.set(
        status,
        (workforceByStatusMap.get(status) || 0) + 1,
      );

      if (status === JobStatus.ACTIVE || status === JobStatus.NOTICE_PERIOD) {
        active++;
        if (mob.projectId && mob.project?.name) {
          const existing = projectHeadcount.get(mob.projectId);
          if (existing) {
            existing.headcount++;
          } else {
            projectHeadcount.set(mob.projectId, {
              projectName: mob.project.name,
              headcount: 1,
            });
          }
        }
      } else if (status === JobStatus.IDLE) {
        idle++;
      } else if (leaveStatuses.has(status as JobStatus)) {
        onLeave++;
      } else if (status === JobStatus.OFF) {
        off++;
      } else if (terminalStatuses.has(status as JobStatus)) {
        other++;
      } else {
        other++;
      }
    }

    const timesheets = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      total: 0,
    };
    for (const row of timesheetRows) {
      const count = Number(row.count) || 0;
      timesheets.total += count;
      if (row.status === TimesheetStatus.DRAFT) timesheets.draft = count;
      else if (row.status === TimesheetStatus.SUBMITTED)
        timesheets.submitted = count;
      else if (row.status === TimesheetStatus.APPROVED) timesheets.approved = count;
      else if (row.status === TimesheetStatus.REJECTED) timesheets.rejected = count;
    }

    const invoices = {
      draft: 0,
      pending: 0,
      approved: 0,
      sent: 0,
      paid: 0,
      cancelled: 0,
      outstandingAmount: 0,
    };
    for (const inv of invoiceRows) {
      const status = String(inv.status).toLowerCase();
      if (status === InvoiceStatus.DRAFT) invoices.draft++;
      else if (status === InvoiceStatus.PENDING) invoices.pending++;
      else if (status === InvoiceStatus.APPROVED) invoices.approved++;
      else if (status === InvoiceStatus.SENT) {
        invoices.sent++;
        invoices.outstandingAmount += Number(inv.totalAmount) || 0;
      } else if (status === InvoiceStatus.PAID) invoices.paid++;
      else if (status === InvoiceStatus.CANCELLED) invoices.cancelled++;
    }

    const settlements = {
      draft: 0,
      pendingApproval: 0,
      approved: 0,
      paid: 0,
      cancelled: 0,
    };
    for (const s of settlementRows) {
      const status = String(s.status).toLowerCase();
      if (status === SettlementStatus.DRAFT) settlements.draft++;
      else if (status === SettlementStatus.PENDING_APPROVAL)
        settlements.pendingApproval++;
      else if (status === SettlementStatus.APPROVED) settlements.approved++;
      else if (status === SettlementStatus.PAID) settlements.paid++;
      else if (status === SettlementStatus.CANCELLED) settlements.cancelled++;
    }

    const topProjects = [...projectHeadcount.entries()]
      .map(([projectId, data]) => ({
        projectId,
        projectName: data.projectName,
        headcount: data.headcount,
      }))
      .sort((a, b) => b.headcount - a.headcount)
      .slice(0, 8);

    const workforceByStatus = [...workforceByStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const employeesBySupplier = supplierEmployeeRows.map((row) => ({
      supplierName: row.supplierName,
      count: row.count,
    }));
    const adaaEmployees =
      employeesBySupplier.find((row) => row.supplierName === ADAA_SUPPLIER_NAME)
        ?.count ?? 0;
    const otherEmployees = Math.max(0, employees - adaaEmployees);

    return {
      asOf: now.toISOString(),
      month: resolvedMonth,
      counts: {
        employees,
        adaaEmployees,
        otherEmployees,
        projects,
        clients,
        expiringDocuments: expiringDocuments.length,
      },
      workforce: {
        total: effectiveMobilizations.length,
        active,
        idle,
        onLeave,
        off,
        other,
      },
      workforceByStatus,
      timesheets,
      payroll: {
        records: Number(payrollRows?.records) || 0,
        totalHours: Math.round((Number(payrollRows?.totalHours) || 0) * 100) / 100,
        totalGross:
          Math.round((Number(payrollRows?.totalGross) || 0) * 100) / 100,
        totalNet: Math.round((Number(payrollRows?.totalNet) || 0) * 100) / 100,
      },
      invoices,
      settlements,
      topProjects,
      employeesBySupplier,
      payrollTrend: payrollTrendRows,
    };
  }

  private async getEmployeesBySupplier(): Promise<
    Array<{ supplierName: string; count: number }>
  > {
    const rows = await this.employeesRepository
      .createQueryBuilder('e')
      .leftJoin('e.supplier', 's')
      .select(`COALESCE(s.name, 'Unassigned')`, 'supplierName')
      .addSelect('COUNT(*)', 'count')
      .where('e.deletedAt IS NULL')
      .groupBy(`COALESCE(s.name, 'Unassigned')`)
      .orderBy('count', 'DESC')
      .getRawMany<{ supplierName: string; count: string }>();

    return rows.map((row) => ({
      supplierName: row.supplierName || 'Unassigned',
      count: Number(row.count) || 0,
    }));
  }

  private async getPayrollTrend(months: number) {
    const rows = await this.payrollRepository
      .createQueryBuilder('p')
      .innerJoin('p.employee', 'e')
      .innerJoin('e.supplier', 's')
      .select('p.month', 'month')
      .addSelect('COUNT(*)', 'records')
      .addSelect('COALESCE(SUM(p.totalGrossSalary), 0)', 'gross')
      .addSelect('COALESCE(SUM(p.netSalary), 0)', 'net')
      .where('p.deletedAt IS NULL')
      .andWhere('s.name = :adaaSupplier', { adaaSupplier: ADAA_SUPPLIER_NAME })
      .groupBy('p.month')
      .orderBy('p.month', 'DESC')
      .limit(months)
      .getRawMany<{ month: string; records: string; gross: string; net: string }>();

    return rows
      .reverse()
      .map((row) => ({
        month: row.month,
        records: Number(row.records) || 0,
        gross: Math.round((Number(row.gross) || 0) * 100) / 100,
        net: Math.round((Number(row.net) || 0) * 100) / 100,
      }));
  }

  async getWorkforceInsights(
    year?: string,
    month?: string,
  ): Promise<WorkforceInsights> {
    const today = formatDateOnly(new Date());
    const periodYear =
      year && /^\d{4}$/.test(year) ? Number(year) : Number(today.slice(0, 4));
    const periodMonth = this.parsePeriodMonth(month);
    const periodStart = periodMonth
      ? `${periodYear}-${this.pad2(periodMonth)}-01`
      : `${periodYear}-01-01`;
    const periodEnd = periodMonth
      ? this.lastDateOfMonth(periodYear, periodMonth)
      : `${periodYear}-12-31`;
    const asOf = periodEnd > today ? today : periodEnd;

    const monthKeys = this.insightMonthKeys(periodYear, periodMonth, today);
    const [effective, monthlyPayroll, expiry] = await Promise.all([
      this.mobilizationsService.getEffectiveStatusForAllEmployeesOnDate(
        parseDateOnly(asOf),
        true,
      ),
      this.getMonthlyPayrollTrend(periodYear),
      this.getExpiryInsightBuckets(asOf),
    ]);
    const hourParts: Awaited<
      ReturnType<TimesheetsService['getDisplayedHoursAttributionForMonth']>
    >[] = [];
    for (const key of monthKeys) {
      hourParts.push(
        await this.timesheetsService.getDisplayedHoursAttributionForMonth(key),
      );
    }

    const hoursByEmployee = new Map<number, number>();
    const mixRows: TimesheetInsightMixRow[] = [];
    const idleHoursByEmployee = new Map<number, number>();
    const idleByEmployee = new Map<number, { trade: string }>();
    const onSiteByEmployee = new Map<
      number,
      { fat: string; clientName: string; trade: string; hours: number }
    >();
    const timesheetStatusHours = new Map<string, number>();

    for (const part of hourParts) {
      for (const [employeeId, hours] of part.employeeHours) {
        hoursByEmployee.set(
          employeeId,
          (hoursByEmployee.get(employeeId) ?? 0) + hours,
        );
      }
      mixRows.push(...part.mix);
      for (const [employeeId, hours] of part.idleHoursByEmployee) {
        idleHoursByEmployee.set(
          employeeId,
          (idleHoursByEmployee.get(employeeId) ?? 0) + hours,
        );
      }
      for (const [employeeId, attr] of part.idleByEmployee) {
        if (!idleByEmployee.has(employeeId)) {
          idleByEmployee.set(employeeId, attr);
        }
      }
      for (const [employeeId, attr] of part.onSiteByEmployee) {
        const existing = onSiteByEmployee.get(employeeId);
        if (!existing || attr.hours > existing.hours) {
          onSiteByEmployee.set(employeeId, { ...attr });
        }
      }
      for (const [, byStatus] of part.statusHoursByEmployee) {
        for (const [jobStatus, hours] of byStatus) {
          timesheetStatusHours.set(
            jobStatus,
            (timesheetStatusHours.get(jobStatus) ?? 0) + hours,
          );
        }
      }
    }

    const hoursOf = (employeeId: number) => hoursByEmployee.get(employeeId) ?? 0;
    const roundHours = (value: number) => Math.round(value * 100) / 100;
    const share = (part: number, whole: number) =>
      whole === 0 ? 0 : Math.round((part / whole) * 10000) / 100;

    const fatMap = new Map<string, { count: number; hours: number }>();
    const tradeMap = new Map<string, { count: number; hours: number }>();
    const clientMap = new Map<string, { count: number; hours: number }>();
    const clientFat = new Map<
      string,
      {
        adaa: number;
        adaaHours: number;
        client: number;
        clientHours: number;
        other: number;
        otherHours: number;
      }
    >();
    const idleByTrade = new Map<string, { count: number; hours: number }>();
    const statusMap = new Map<string, { count: number; hours: number }>();

    const ensureMix = (
      map: Map<string, { count: number; hours: number }>,
      key: string,
    ) => {
      const current = map.get(key) ?? { count: 0, hours: 0 };
      map.set(key, current);
      return current;
    };

    const bumpCount = (
      map: Map<string, { count: number; hours: number }>,
      key: string,
    ) => {
      ensureMix(map, key).count += 1;
    };

    const bumpHours = (
      map: Map<string, { count: number; hours: number }>,
      key: string,
      hours: number,
    ) => {
      ensureMix(map, key).hours += hours;
    };

    const statusLabel = (jobStatus: string | null | undefined): string => {
      const status = String(jobStatus || '').toLowerCase();
      if (status === JobStatus.ACTIVE || status === JobStatus.NOTICE_PERIOD) {
        return 'ACTIVE';
      }
      if (status === JobStatus.ABSENT) {
        return 'ABSENT';
      }
      if (status === JobStatus.IDLE) {
        return 'IDLE';
      }
      if (
        status === JobStatus.OFF ||
        status === JobStatus.ANNUAL_LEAVE ||
        status === JobStatus.SICK_LEAVE ||
        status === JobStatus.CASUAL_LEAVE ||
        status === JobStatus.URGENT_LEAVE
      ) {
        return 'HOLD';
      }
      return '';
    };

    // Period on-site headcount (FAT / trade / client): people assigned to a
    // project on at least one day in the selected period — not an end-of-month
    // snapshot mixed with anyone who logged hours.
    for (const [, attr] of onSiteByEmployee) {
      const { fat, trade, clientName } = attr;
      bumpCount(fatMap, fat);
      bumpCount(tradeMap, trade);
      bumpCount(clientMap, clientName);

      const split = clientFat.get(clientName) ?? {
        adaa: 0,
        adaaHours: 0,
        client: 0,
        clientHours: 0,
        other: 0,
        otherHours: 0,
      };
      if (fat === 'ADAA') {
        split.adaa += 1;
      } else if (fat === 'CLIENT') {
        split.client += 1;
      } else {
        split.other += 1;
      }
      clientFat.set(clientName, split);
    }

    for (const row of mixRows) {
      bumpHours(tradeMap, row.trade, row.hours);
      if (row.isIdle) {
        bumpHours(idleByTrade, row.trade, row.hours);
        continue;
      }
      bumpHours(fatMap, row.fat, row.hours);
      bumpHours(clientMap, row.clientName, row.hours);

      const split = clientFat.get(row.clientName) ?? {
        adaa: 0,
        adaaHours: 0,
        client: 0,
        clientHours: 0,
        other: 0,
        otherHours: 0,
      };
      if (row.fat === 'ADAA') {
        split.adaaHours += row.hours;
      } else if (row.fat === 'CLIENT') {
        split.clientHours += row.hours;
      } else {
        split.otherHours += row.hours;
      }
      clientFat.set(row.clientName, split);
    }

    // Period idle headcount by trade (people who appeared on the idle sheet).
    for (const [, attr] of idleByEmployee) {
      bumpCount(idleByTrade, attr.trade);
    }

    // Status cards: workforce snapshot at period end (excludes cancelled/absconded).
    for (const mob of effective) {
      const label = statusLabel(mob.jobStatus);
      if (label) {
        bumpCount(statusMap, label);
      }
    }

    for (const [jobStatus, hours] of timesheetStatusHours) {
      const label = statusLabel(jobStatus);
      if (label) {
        bumpHours(statusMap, label, hours);
      }
    }

    const counted = new Set(onSiteByEmployee.keys());
    const total = counted.size;
    const totalHours = roundHours(
      hourParts.reduce((sum, part) => sum + (part.totalHours || 0), 0),
    );

    const toRows = (
      map: Map<string, { count: number; hours: number }>,
    ): WorkforceInsightRow[] =>
      [...map.entries()]
        .map(([label, value]) => ({
          label,
          count: value.count,
          percent: share(value.count, total),
          hours: roundHours(value.hours),
          hoursPercent: share(value.hours, totalHours),
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const fatOrder = ['ADAA', 'CLIENT', 'UNSPECIFIED'];
    const fat = toRows(fatMap).sort(
      (a, b) => fatOrder.indexOf(a.label) - fatOrder.indexOf(b.label),
    );

    const clientsByFat = [...clientFat.entries()]
      .map(([client, split]) => ({
        client,
        adaa: split.adaa,
        adaaHours: roundHours(split.adaaHours),
        clientFat: split.client,
        clientHours: roundHours(split.clientHours),
        total: split.adaa + split.client + split.other,
        totalHours: roundHours(
          split.adaaHours + split.clientHours + split.otherHours,
        ),
      }))
      .sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));

    const idleRows = [...idleByTrade.entries()]
      .map(([trade, value]) => ({
        trade,
        count: value.count,
        hours: roundHours(value.hours),
      }))
      .sort((a, b) => b.count - a.count || a.trade.localeCompare(b.trade));

    const statusOrder = ['ABSENT', 'ACTIVE', 'HOLD', 'IDLE'];
    const status = statusOrder.map((label) => ({
      label,
      count: statusMap.get(label)?.count ?? 0,
      hours: roundHours(statusMap.get(label)?.hours ?? 0),
    }));

    return {
      asOf,
      periodStart,
      periodEnd,
      period: periodMonth ? 'month' : 'year',
      total,
      totalHours,
      fat,
      trades: toRows(tradeMap),
      clients: toRows(clientMap),
      clientsByFat,
      fatTotals: {
        adaa: fatMap.get('ADAA')?.count ?? 0,
        client: fatMap.get('CLIENT')?.count ?? 0,
        adaaHours: roundHours(fatMap.get('ADAA')?.hours ?? 0),
        clientHours: roundHours(fatMap.get('CLIENT')?.hours ?? 0),
      },
      idleByTrade: idleRows,
      idleTotals: {
        count: idleByEmployee.size,
        hours: roundHours(
          [...idleHoursByEmployee.values()].reduce(
            (sum, hours) => sum + hours,
            0,
          ),
        ),
      },
      status,
      countries: await this.getCountryInsightRows(
        [...counted],
        hoursOf,
        total,
        totalHours,
        roundHours,
        share,
      ),
      monthlyPayroll,
      expiry,
    };
  }

  private insightMonthKeys(
    year: number,
    month: number | null,
    today: string,
  ): string[] {
    if (month) {
      return [`${year}-${this.pad2(month)}`];
    }
    const todayYear = Number(today.slice(0, 4));
    const todayMonth = Number(today.slice(5, 7));
    const lastMonth =
      year > todayYear ? 0 : year === todayYear ? todayMonth : 12;
    return Array.from(
      { length: lastMonth },
      (_, index) => `${year}-${this.pad2(index + 1)}`,
    );
  }

  private pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  private parsePeriodMonth(month?: string): number | null {
    if (!month || month === 'all') {
      return null;
    }
    const parsed = Number(month);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
      return null;
    }
    return parsed;
  }

  private lastDateOfMonth(year: number, month: number): string {
    const day = new Date(year, month, 0).getDate();
    return `${year}-${this.pad2(month)}-${this.pad2(day)}`;
  }

  private monthLabel(month: string): string {
    const [year, monthNum] = month.split('-');
    const date = new Date(Number(year), Number(monthNum) - 1, 1);
    const short = date.toLocaleString('en-US', { month: 'short' });
    return `${short}-${String(year).slice(-2)}`;
  }

  private yearMonthKeys(year: number): string[] {
    return Array.from(
      { length: 12 },
      (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`,
    );
  }

  private async getCountryInsightRows(
    employeeIds: number[],
    hoursOf: (employeeId: number) => number,
    total: number,
    totalHours: number,
    roundHours: (value: number) => number,
    share: (part: number, whole: number) => number,
  ): Promise<CountryInsightRow[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    const employees = await this.employeesRepository
      .createQueryBuilder('employee')
      .select(['employee.id', 'employee.nationality'])
      .where('employee.id IN (:...ids)', { ids: employeeIds })
      .getMany();

    const byCountry = new Map<
      string,
      {
        country: string;
        isoCode: string | null;
        lat: number | null;
        lng: number | null;
        count: number;
        hours: number;
      }
    >();

    for (const employee of employees) {
      const resolved = resolveCountryFromNationality(employee.nationality);
      const country =
        resolved?.name || employee.nationality?.trim() || 'No nationality';
      const key = resolved?.iso || country.toLowerCase();
      const current = byCountry.get(key) ?? {
        country,
        isoCode: resolved?.iso ?? null,
        lat: resolved?.lat ?? null,
        lng: resolved?.lng ?? null,
        count: 0,
        hours: 0,
      };
      current.count += 1;
      current.hours += hoursOf(employee.id);
      byCountry.set(key, current);
    }

    return [...byCountry.values()]
      .map((value) => ({
        country: value.country,
        isoCode: value.isoCode,
        lat: value.lat,
        lng: value.lng,
        count: value.count,
        percent: share(value.count, total),
        hours: roundHours(value.hours),
        hoursPercent: share(value.hours, totalHours),
      }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
  }

  private async getMonthlyPayrollTrend(
    year: number,
  ): Promise<MonthlyMoneyInsightRow[]> {
    const startMonth = `${year}-01`;
    const endMonth = `${year}-12`;
    const rows = await this.payrollRepository
      .createQueryBuilder('p')
      .innerJoin('p.employee', 'e')
      .innerJoin('e.supplier', 's')
      .select('p.month', 'month')
      .addSelect('COUNT(*)', 'headcount')
      .addSelect(
        'COALESCE(SUM(p.totalHours + p.totalOtHours + p.totalOffdaysWorkedHours), 0)',
        'hours',
      )
      .addSelect('COALESCE(SUM(p.totalGrossSalary), 0)', 'amount')
      .where('p.deletedAt IS NULL')
      .andWhere('s.name = :adaaSupplier', { adaaSupplier: ADAA_SUPPLIER_NAME })
      .andWhere('p.month BETWEEN :startMonth AND :endMonth', {
        startMonth,
        endMonth,
      })
      .groupBy('p.month')
      .orderBy('p.month', 'ASC')
      .getRawMany<{
        month: string;
        headcount: string;
        hours: string;
        amount: string;
      }>();

    const byMonth = new Map(
      rows.map((row) => [
        row.month,
        {
          headcount: Number(row.headcount) || 0,
          hours: Math.round((Number(row.hours) || 0) * 100) / 100,
          amount: Math.round((Number(row.amount) || 0) * 100) / 100,
        },
      ]),
    );

    return this.yearMonthKeys(year).map((month) => ({
      month,
      label: this.monthLabel(month),
      headcount: byMonth.get(month)?.headcount ?? 0,
      hours: byMonth.get(month)?.hours ?? 0,
      amount: byMonth.get(month)?.amount ?? 0,
    }));
  }

  private async getExpiryInsightBuckets(
    asOf: string,
  ): Promise<WorkforceInsights['expiry']> {
    const empty = (): ExpiryInsightBucket => ({
      visa: 0,
      eid: 0,
      workPermit: 0,
      passport: 0,
      total: 0,
    });
    const next15 = empty();
    const oneMonth = empty();
    const asOfDate = parseDateOnly(asOf);

    const excludedIds = await this.getExpiryAlertExcludedEmployeeIds();
    const employeeQuery = this.employeesRepository
      .createQueryBuilder('employee')
      .select([
        'employee.pp_expiry',
        'employee.emirates_id_expiry',
        'employee.visa_expiry',
        'employee.work_permit_expiry',
      ])
      .where('employee.deletedAt IS NULL');

    if (excludedIds.length > 0) {
      employeeQuery.andWhere('employee.id NOT IN (:...excludedIds)', {
        excludedIds,
      });
    }

    const employees = await employeeQuery.getMany();

    const daysUntil = (value: string | null | undefined): number | null => {
      if (!value) return null;
      const expiry = new Date(value);
      if (Number.isNaN(expiry.getTime())) return null;
      expiry.setUTCHours(0, 0, 0, 0);
      return Math.ceil(
        (expiry.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    };

    const add = (
      bucket: ExpiryInsightBucket,
      key: keyof Omit<ExpiryInsightBucket, 'total'>,
    ) => {
      bucket[key] += 1;
      bucket.total += 1;
    };

    for (const employee of employees) {
      const docs: Array<[keyof Omit<ExpiryInsightBucket, 'total'>, number | null]> =
        [
          ['passport', daysUntil(employee.pp_expiry)],
          ['eid', daysUntil(employee.emirates_id_expiry)],
          ['visa', daysUntil(employee.visa_expiry)],
          ['workPermit', daysUntil(employee.work_permit_expiry)],
        ];
      for (const [key, days] of docs) {
        if (days == null) continue;
        if (days <= 15) add(next15, key);
        else if (days <= 30) add(oneMonth, key);
      }
    }

    return { next15, oneMonth };
  }

  private formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
