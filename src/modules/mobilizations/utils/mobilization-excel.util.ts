import * as XLSX from 'xlsx';

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any[];
}

export const REQUIRED_HEADERS = [
  'ID NO',
  'NAME',
  'ACTUAL TRADE',
  'PP NO',
  'NATIONALITY',
  'MOBILIZED TRADE',
  'CLIENT',
  'SITE',
  'REASON',
  'MOB-DEM',
  'DATE',
];

export class MobilizationExcelUtil {
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

      // Check if workbook has sheets
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        errors.push('Excel file has no sheets.');
        return { isValid: false, errors };
      }

      // Check if a sheet named "Mobilizations" exists
      const mobilizationsSheet = workbook.SheetNames.find(
        (name) => name.trim().toLowerCase() === 'mobilizations',
      );

      if (!mobilizationsSheet) {
        const sheetsList = workbook.SheetNames.map((name) => `"${name}"`).join(
          ', ',
        );
        errors.push(
          `Sheet "Mobilizations" not found. Found sheets: ${sheetsList}. Please ensure your Excel file has a sheet named "Mobilizations".`,
        );
        return { isValid: false, errors };
      }

      // Use the Mobilizations sheet
      const worksheet = workbook.Sheets[mobilizationsSheet];

      // Convert to JSON with trimmed headers
      const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawData || rawData.length === 0) {
        errors.push('The Excel sheet is empty.');
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
   * Maps Excel row data to mobilization data
   * @param row Excel row
   * @returns Mapped mobilization data
   */
  static mapRowToMobilization(row: any): any {
    // Map MOB-DEM to mobStatus
    const mobDemValue = row['MOB-DEM']?.toString().trim().toLowerCase() || '';
    const mobStatus = mobDemValue === 'mobilized' ? 'mobilized' : 'demobilized';

    // If mobStatus is mobilized, status is active; otherwise inactive
    const status = mobStatus === 'mobilized' ? 'active' : 'inactive';

    // Map REASON to jobStatus
    const reasonValue = row['REASON']?.toString().trim().toLowerCase() || '';
    let jobStatus = 'on_job'; // Default
    if (reasonValue.includes('vacation')) {
      jobStatus = 'on_vacation';
    } else if (reasonValue.includes('cancel')) {
      jobStatus = 'cancelled';
    } else if (reasonValue.includes('abscond')) {
      jobStatus = 'absconded';
    }

    // Get mobilized trade - use ACTUAL TRADE if MOBILIZED TRADE is empty
    const mobilizedTradeValue = row['MOBILIZED TRADE']?.toString().trim() || '';
    const actualTradeValue = row['ACTUAL TRADE']?.toString().trim() || '';
    const finalMobilizedTrade = mobilizedTradeValue || actualTradeValue;

    return {
      // Employee identification
      employeeIdNo: row['ID NO']?.toString().trim() || null,
      employeeName: row['NAME']?.toString().trim() || '',
      employeeActualTrade: actualTradeValue || null,
      employeePpNo: row['PP NO']?.toString().trim() || null,
      employeeNationality: row['NATIONALITY']?.toString().trim() || null,

      // Mobilization fields
      mobilizedTradeName: finalMobilizedTrade || null,
      clientName: row['CLIENT']?.toString().trim() || null,
      siteName: row['SITE']?.toString().trim() || null,
      status,
      mobStatus,
      jobStatus,
      actionDate: this.excelDateToISO(row['DATE']),
      notes: null,

      // Optional fields
      bookingForClient: row['BOOKING FOR CLIENT']?.toString().trim() || null,
      categories: row['CATEGORIES']?.toString().trim() || null,
    };
  }

  /**
   * Generates an Excel template for mobilization import
   * @returns Excel buffer
   */
  static generateTemplate(): Buffer {
    const templateData = [
      {
        'S.R NO': 1,
        'ID NO': 'EMP001',
        NAME: 'John Doe',
        'ACTUAL TRADE': 'Mason',
        'PP NO': 'A12345678',
        NATIONALITY: 'Indian',
        'MOBILIZED TRADE': 'Mason',
        CLIENT: 'ABC Company',
        SITE: 'Dubai Marina Project',
        REASON: 'On Job',
        'BOOKING FOR CLIENT': '',
        CATEGORIES: '',
        'MOB-DEM': 'mobilized',
        DATE: '2024-01-15',
      },
      {
        'S.R NO': 2,
        'ID NO': 'EMP002',
        NAME: 'Jane Smith',
        'ACTUAL TRADE': 'Carpenter',
        'PP NO': 'B98765432',
        NATIONALITY: 'Pakistani',
        'MOBILIZED TRADE': 'Carpenter',
        CLIENT: 'XYZ Corporation',
        SITE: 'Business Bay Tower',
        REASON: 'On Vacation',
        'BOOKING FOR CLIENT': '',
        CATEGORIES: '',
        'MOB-DEM': 'demobilized',
        DATE: '2024-01-20',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobilizations');

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generates an Excel export of mobilizations
   * @param mobilizations Array of mobilizations with related data
   * @returns Excel buffer
   */
  static generateExport(mobilizations: any[]): Buffer {
    const exportData = mobilizations.map((mob, index) => {
      // Get primary trade from employee skills (first skill)
      const actualTrade =
        mob.employee?.employeeSkills && mob.employee.employeeSkills.length > 0
          ? mob.employee.employeeSkills[0].skill.skill
          : '';

      // Map jobStatus to REASON
      let reason = 'On Job';
      if (mob.jobStatus === 'on_vacation') {
        reason = 'On Vacation';
      } else if (mob.jobStatus === 'cancelled') {
        reason = 'Cancelled';
      } else if (mob.jobStatus === 'absconded') {
        reason = 'Absconded';
      }

      // Map mobStatus to MOB-DEM
      const mobDem =
        mob.mobStatus === 'mobilized' ? 'mobilized' : 'demobilized';

      return {
        'S.R NO': index + 1,
        'ID NO': mob.employee?.adaa_emp_code || '',
        NAME: mob.employee?.name || '',
        'ACTUAL TRADE': actualTrade,
        'PP NO': mob.employee?.pp_no || '',
        NATIONALITY: mob.employee?.nationality || '',
        'MOBILIZED TRADE': mob.mobilizedTrade?.skill || '',
        CLIENT: mob.project?.client?.name || '',
        SITE: mob.project?.name || '',
        REASON: reason,
        'BOOKING FOR CLIENT': '',
        CATEGORIES: '',
        'MOB-DEM': mobDem,
        DATE: mob.actionDate
          ? new Date(mob.actionDate).toISOString().split('T')[0]
          : '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobilizations');

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
