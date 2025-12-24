import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';

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
   * Converts Excel date serial number to ISO date string
   * @param serial Excel date serial
   * @returns ISO date string or null
   */
  static excelDateToISO(serial: any): string | null {
    if (!serial) return null;

    // If it's already a string, try to parse it
    if (typeof serial === 'string') {
      const date = new Date(serial);
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    }

    // If it's a number (Excel date serial)
    if (typeof serial === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(
        excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000,
      );
      return date.toISOString().split('T')[0];
    }

    return null;
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
      status: 'active', // Default status
      date_of_joining: this.excelDateToISO(row['DOJ']),
      date_of_arrival: null, // Not in Excel

      // Special handling for trade (will be processed separately)
      trade: toNullIfEmpty(row['TRADE']),

      // Additional fields (accepted but not saved to DB yet)
      _additionalData: {
        basic_salary: row['BASIC SALARY']
          ? parseFloat(row['BASIC SALARY'].toString())
          : null,
        hra: row['HRA'] ? parseFloat(row['HRA'].toString()) : null,
        other_allowance: row['OTHER ALLOWANCE']
          ? parseFloat(row['OTHER ALLOWANCE'].toString())
          : null,
        rate_per_hr: row['RATE PER HR']
          ? parseFloat(row['RATE PER HR'].toString())
          : null,
        total_salary: row['TOTAL SALARY']
          ? parseFloat(row['TOTAL SALARY'].toString())
          : null,
      },
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
        DOJ: emp.date_of_joining
          ? new Date(emp.date_of_joining).toISOString().split('T')[0]
          : '',
        DOB: emp.dob ? new Date(emp.dob).toISOString().split('T')[0] : '',
        NATIONALITY: emp.nationality || '',
        'PP EXPIRY': emp.pp_expiry
          ? new Date(emp.pp_expiry).toISOString().split('T')[0]
          : '',
        'VISA EXPIRY': emp.visa_expiry
          ? new Date(emp.visa_expiry).toISOString().split('T')[0]
          : '',
        'EID NO': emp.emirates_id || '',
        'Emirates ID Expiry Date': emp.emirates_id_expiry
          ? new Date(emp.emirates_id_expiry).toISOString().split('T')[0]
          : '',
        'BASIC SALARY': '', // Not in DB yet
        HRA: '', // Not in DB yet
        'OTHER ALLOWANCE': '', // Not in DB yet
        'RATE PER HR': '', // Not in DB yet
        'TOTAL SALARY': '', // Not in DB yet
        'CONTACT NO': emp.contact_no || '',
        'PERSONAL CODE': emp.personal_code || '',
        'WORK PERMIT': emp.work_permit_no || '',
        'WP EXPIRY': emp.work_permit_expiry
          ? new Date(emp.work_permit_expiry).toISOString().split('T')[0]
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
