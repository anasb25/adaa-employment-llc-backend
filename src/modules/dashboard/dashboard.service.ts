import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Employee, EmployeeStatus } from '../employees/entities/employee.entity';

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
  ) {}

  async getEmployeesWithExpiringDocuments(): Promise<EmployeeWithExpiringDocs[]> {
    // Get current date and date 15 days from now
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const fifteenDaysFromNow = new Date(today);
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999); // End of the 15th day

    // Format dates as YYYY-MM-DD for comparison
    const todayStr = this.formatDateToYYYYMMDD(today);
    const fifteenDaysStr = this.formatDateToYYYYMMDD(fifteenDaysFromNow);

    // Get all active employees
    const employees = await this.employeesRepository.find({
      where: { status: EmployeeStatus.ACTIVE },
      select: [
        'id',
        'adaa_emp_code',
        'name',
        'contact_no',
        'pp_expiry',
        'emirates_id_expiry',
        'visa_expiry',
        'work_permit_expiry',
      ],
    });

    const employeesWithExpiringDocs: EmployeeWithExpiringDocs[] = [];

    // Check each employee for expiring documents
    for (const employee of employees) {
      const expiringDocuments: ExpiringDocument[] = [];

      // Define document fields to check
      const documentsToCheck = [
        { field: 'pp_expiry', label: 'Passport', value: employee.pp_expiry },
        { field: 'emirates_id_expiry', label: 'Emirates ID', value: employee.emirates_id_expiry },
        { field: 'visa_expiry', label: 'Visa', value: employee.visa_expiry },
        { field: 'work_permit_expiry', label: 'Work Permit', value: employee.work_permit_expiry },
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
            console.warn(`Invalid date for ${doc.label} of employee ${employee.adaa_emp_code}: ${doc.value}`);
            continue;
          }

          expiryDate.setHours(0, 0, 0, 0);

          // Calculate days until expiry (negative if already expired)
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

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
          console.error(`Error processing ${doc.label} expiry for employee ${employee.adaa_emp_code}:`, error);
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
          expiringDocuments: expiringDocuments.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
        });
      }
    }

    // Sort employees by the most urgent expiration (lowest daysUntilExpiry, expired first)
    employeesWithExpiringDocs.sort((a, b) => {
      const minDaysA = Math.min(...a.expiringDocuments.map(d => d.daysUntilExpiry));
      const minDaysB = Math.min(...b.expiringDocuments.map(d => d.daysUntilExpiry));
      return minDaysA - minDaysB;
    });

    // Sort documents within each employee (expired first, then by urgency)
    employeesWithExpiringDocs.forEach(employee => {
      employee.expiringDocuments.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
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

