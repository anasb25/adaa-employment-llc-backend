import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import {
  Mobilization,
  JobStatus,
} from '../mobilizations/entities/mobilization.entity';
import { MobilizationsService } from '../mobilizations/mobilizations.service';
import { Project } from '../projects/entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import {
  Timesheet,
  TimesheetStatus,
} from '../timesheets/entities/timesheet.entity';
import { Payroll } from '../payroll/entities/payroll.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import {
  Settlement,
  SettlementStatus,
} from '../settlements/entities/settlement.entity';
import { DashboardStats } from './dashboard-stats.interface';
import { ADAA_SUPPLIER_NAME } from '../../common/constants/supplier.constants';

export interface ExpiringDocument {
  field: string;
  label: string;
  expiryDate: string;
  daysUntilExpiry: number;
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
    @InjectRepository(Payroll)
    private payrollRepository: Repository<Payroll>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Settlement)
    private settlementRepository: Repository<Settlement>,
    private mobilizationsService: MobilizationsService,
  ) {}

  async getEmployeesWithExpiringDocuments(): Promise<
    EmployeeWithExpiringDocs[]
  > {
    // Get current date and date 15 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999); // End of the 15th day

    // Statuses that should be excluded from expiry alerts
    const excludedStatuses = [JobStatus.CANCELLED, JobStatus.ABSCONDED];

    // Get employee IDs whose latest mobilization has a cancelled or absconded status.
    // The latest mobilization is determined by actionDate DESC, then id DESC.
    const excludedEmployeeIds = await this.mobilizationRepository
      .createQueryBuilder('mob')
      .select('mob.employeeId', 'employeeId')
      .where((qb) => {
        // Subquery: for each employee, find the latest mobilization record
        const subQuery = qb
          .subQuery()
          .select('m2.id')
          .from(Mobilization, 'm2')
          .where('m2.employeeId = mob.employeeId')
          .andWhere('m2.deletedAt IS NULL')
          .orderBy('m2.actionDate', 'DESC')
          .addOrderBy('m2.id', 'DESC')
          .limit(1)
          .getQuery();
        return `mob.id = ${subQuery}`;
      })
      .andWhere('mob.deletedAt IS NULL')
      .andWhere('mob.jobStatus IN (:...excludedStatuses)', { excludedStatuses })
      .getRawMany();

    const excludedIds = excludedEmployeeIds.map((r) => r.employeeId);

    // Get all employees, excluding those with cancelled/absconded latest mobilization
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

  private formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
