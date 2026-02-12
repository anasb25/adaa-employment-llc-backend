import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import {
  excelSerialToDateString,
  formatDateOnly,
} from '../../../common/utils/date.util';

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any[];
}

export const REQUIRED_HEADERS = [
  'ADAA EMP CODE',
  'NAME',
  'TRADE',
  'PP No',
  'DOJ',
  'DOB',
  'NATIONALITY',
  'PP EXPIRY',
  'VISA EXPIRY',
  'EID NO',
  'Emirates ID Expiry Date',
  'BASIC SALARY',
  'HRA',
  'OTHER ALLOWANCE',
  'RATE PER HR',
  'TOTAL SALARY',
  'CONTACT NO',
  'PERSONAL CODE',
  'WORK PERMIT',
  'WP EXPIRY',
];

export class ExcelValidatorUtil {
  /**
   * Validates the Excel file structure
   * @param buffer The file buffer
   * @returns Validation result
   */
  static validateExcelFile(buffer: Buffer): ExcelValidationResult {
    const errors: string[] = [];

    try {
      // Parse the Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Check if a sheet containing "Master List" exists (case-insensitive, trimmed)
      const masterSheet = workbook.SheetNames.find((name) =>
        name.trim().toLowerCase().includes('master list'),
      );

      if (!masterSheet) {
        const sheetsList = workbook.SheetNames.map((name) => `"${name}"`).join(
          ', ',
        );
        errors.push(
          `Sheet containing "Master List" not found. Found sheets: ${sheetsList}. Please ensure your Excel file has a sheet with "Master List" in its name.`,
        );
        return { isValid: false, errors };
      }

      // Get the Master List sheet
      const worksheet = workbook.Sheets[masterSheet];

      // Convert to JSON with trimmed headers
      const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawData || rawData.length === 0) {
        errors.push('The "Master List" sheet is empty.');
        return { isValid: false, errors };
      }

      // Trim all header keys in the data
      const data = rawData.map((row: any) => {
        const trimmedRow: any = {};
        Object.keys(row).forEach((key) => {
          trimmedRow[key.trim()] = row[key];
        });
        return trimmedRow;
      });

      // Validate headers
      const firstRow = data[0] as any;
      const actualHeaders = Object.keys(firstRow);

      const missingHeaders = REQUIRED_HEADERS.filter(
        (header) => !actualHeaders.includes(header),
      );

      if (missingHeaders.length > 0) {
        errors.push(
          `Missing required columns: ${missingHeaders.join(', ')}. Please ensure all required columns are present.`,
        );
        return { isValid: false, errors };
      }

      return { isValid: true, errors: [], data };
    } catch (error) {
      errors.push(`Failed to parse Excel file: ${error.message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Converts Excel date serial number to ISO date string (timezone-neutral)
   * @param serial Excel date serial
   * @returns ISO date string or null
   */
  static excelDateToISO(serial: any): string | null {
    // Use the centralized timezone-neutral date utility
    return excelSerialToDateString(serial);
  }

  /**
   * Maps Excel row data to employee data
   * @param row Excel row
   * @returns Mapped employee data with trade
   */
  static mapRowToEmployee(row: any): any {
    // Helper function to convert empty strings to null for unique fields
    const toNullIfEmpty = (value: any): string | null => {
      const trimmed = value?.toString().trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    };

    return {
      // Mapped fields (existing in DB)
      adaa_emp_code: row['ADAA EMP CODE']?.toString().trim() || '',
      name: row['NAME']?.toString().trim() || '',
      dob: this.excelDateToISO(row['DOB']),
      pp_no: toNullIfEmpty(row['PP No']),
      pp_expiry: this.excelDateToISO(row['PP EXPIRY']),
      nationality: toNullIfEmpty(row['NATIONALITY']),
      emirates_id: toNullIfEmpty(row['EID NO']),
      emirates_id_expiry: this.excelDateToISO(row['Emirates ID Expiry Date']),
      visa_expiry: this.excelDateToISO(row['VISA EXPIRY']),
      work_permit_no: toNullIfEmpty(row['WORK PERMIT']),
      work_permit_expiry: this.excelDateToISO(row['WP EXPIRY']),
      personal_code: toNullIfEmpty(row['PERSONAL CODE']),
      contact_no: toNullIfEmpty(row['CONTACT NO']),
      date_of_joining: this.excelDateToISO(row['DOJ']),
      date_of_arrival: null, // Not in Excel

      // Salary fields
      basic_salary: row['BASIC SALARY']
        ? parseFloat(row['BASIC SALARY'].toString())
        : null,
      hra: row['HRA'] ? parseFloat(row['HRA'].toString()) : null,
      other_allowance: row['OTHER ALLOWANCE']
        ? parseFloat(row['OTHER ALLOWANCE'].toString())
        : null,

      // Special handling for trade (will be processed separately)
      trade: toNullIfEmpty(row['TRADE']),

      // Rate per hour for employee skill (will be processed separately)
      rate_per_hr: row['RATE PER HR']
        ? parseFloat(row['RATE PER HR'].toString())
        : null,
    };
  }

  /**
   * Generates an Excel template for employee import
   * @returns Excel buffer
   */
  static generateTemplate(): Buffer {
    const templateData = [
      {
        'ADAA EMP CODE': 'EMP001',
        NAME: 'John Doe',
        TRADE: 'Mason',
        'PP No': 'A12345678',
        DOJ: '2024-01-15',
        DOB: '1990-01-01',
        NATIONALITY: 'Indian',
        'PP EXPIRY': '2025-12-31',
        'VISA EXPIRY': '2025-06-30',
        'EID NO': '784-1990-1234567-1',
        'Emirates ID Expiry Date': '2025-12-31',
        'BASIC SALARY': '2000',
        HRA: '500',
        'OTHER ALLOWANCE': '300',
        'RATE PER HR': '25',
        'TOTAL SALARY': '2800',
        'CONTACT NO': '+971501234567',
        'PERSONAL CODE': 'PC001',
        'WORK PERMIT': 'WP123456',
        'WP EXPIRY': '2025-06-30',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master List');

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generates an Excel export of employees
   * @param employees Array of employees with their skills
   * @returns Excel buffer
   */
  static generateExport(employees: any[]): Buffer {
    const exportData = employees.map((emp) => {
      // Get primary trade from employee skills (first skill)
      const primaryTrade =
        emp.employeeSkills && emp.employeeSkills.length > 0
          ? emp.employeeSkills[0].skill.skill
          : '';

      return {
        'ADAA EMP CODE': emp.adaa_emp_code || '',
        NAME: emp.name || '',
        TRADE: primaryTrade,
        'PP No': emp.pp_no || '',
        DOJ: emp.date_of_joining ? formatDateOnly(emp.date_of_joining) : '',
        DOB: emp.dob ? formatDateOnly(emp.dob) : '',
        NATIONALITY: emp.nationality || '',
        'PP EXPIRY': emp.pp_expiry ? formatDateOnly(emp.pp_expiry) : '',
        'VISA EXPIRY': emp.visa_expiry ? formatDateOnly(emp.visa_expiry) : '',
        'EID NO': emp.emirates_id || '',
        'Emirates ID Expiry Date': emp.emirates_id_expiry
          ? formatDateOnly(emp.emirates_id_expiry)
          : '',
        'BASIC SALARY': emp.basic_salary || '',
        HRA: emp.hra || '',
        'OTHER ALLOWANCE': emp.other_allowance || '',
        'RATE PER HR':
          emp.employeeSkills && emp.employeeSkills.length > 0
            ? emp.employeeSkills[0].cost_price || ''
            : '',
        'TOTAL SALARY':
          emp.basic_salary && emp.hra && emp.other_allowance
            ? parseFloat(emp.basic_salary) +
              parseFloat(emp.hra) +
              parseFloat(emp.other_allowance)
            : '',
        'CONTACT NO': emp.contact_no || '',
        'PERSONAL CODE': emp.personal_code || '',
        'WORK PERMIT': emp.work_permit_no || '',
        'WP EXPIRY': emp.work_permit_expiry
          ? formatDateOnly(emp.work_permit_expiry)
          : '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master List');

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
