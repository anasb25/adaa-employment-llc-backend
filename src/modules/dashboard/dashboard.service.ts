import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import {
  Mobilization,
  JobStatus,
} from '../mobilizations/entities/mobilization.entity';

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

  private formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
