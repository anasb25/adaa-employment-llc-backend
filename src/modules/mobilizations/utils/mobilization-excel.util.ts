import * as XLSX from 'xlsx';

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any[];
}

export const REQUIRED_HEADERS = ['ID NO', 'STATUS', 'MOB-DEM', 'DATE'];

export const CONDITIONALLY_REQUIRED_HEADERS = ['CLIENT', 'SITE'];

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

      // Check for required headers
      const missingHeaders = REQUIRED_HEADERS.filter(
        (header) => !actualHeaders.includes(header),
      );

      if (missingHeaders.length > 0) {
        errors.push(
          `Missing required columns: ${missingHeaders.join(', ')}. Please ensure all required columns are present.`,
        );
        return { isValid: false, errors };
      }

      // Validate conditionally required headers (CLIENT and SITE) for mobilized records
      // Only check if headers exist, not values (row-level validation happens during import)
      // Check if there are any mobilized records in the file
      const hasMobilizedRecords = data.some((row: any) => {
        const mobDemValue =
          row['MOB-DEM']?.toString().trim().toLowerCase() || '';
        // Use exact match to avoid "demobilized" matching "mobilized"
        return mobDemValue === 'mobilized';
      });

      // If there are mobilized records, CLIENT and SITE headers must exist
      if (hasMobilizedRecords) {
        const missingConditionalHeaders: string[] = [];
        if (!actualHeaders.includes('CLIENT')) {
          missingConditionalHeaders.push('CLIENT');
        }
        if (!actualHeaders.includes('SITE')) {
          missingConditionalHeaders.push('SITE');
        }

        if (missingConditionalHeaders.length > 0) {
          errors.push(
            `Missing required columns: ${missingConditionalHeaders.join(', ')}. CLIENT and SITE columns are required when importing mobilized records.`,
          );
          return { isValid: false, errors };
        }
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
    // Use exact match to avoid "demobilized" matching "mobilized"
    const mobStatus = mobDemValue === 'mobilized' ? 'mobilized' : 'demobilized';

    // Map STATUS to jobStatus
    const statusValue = row['STATUS']?.toString().trim().toLowerCase() || '';
    let jobStatus = 'active'; // Default

    if (
      statusValue.includes('vacation') ||
      statusValue.includes('on vacation')
    ) {
      jobStatus = 'on_vacation';
    } else if (statusValue.includes('cancel')) {
      jobStatus = 'cancelled';
    } else if (statusValue.includes('abscond')) {
      jobStatus = 'absconded';
    } else if (statusValue.includes('absent')) {
      jobStatus = 'absent';
    } else if (statusValue.includes('sick')) {
      jobStatus = 'sick_leave';
    } else if (statusValue.includes('casual')) {
      jobStatus = 'casual_leave';
    } else if (statusValue.includes('notice')) {
      jobStatus = 'notice_period';
    } else if (statusValue.includes('resign')) {
      jobStatus = 'resigned';
    } else if (statusValue.includes('idle')) {
      jobStatus = 'idle';
    } else if (statusValue.includes('active')) {
      jobStatus = 'active';
    }

    // Get mobilized trade
    const mobilizedTradeValue = row['MOBILIZED TRADE']?.toString().trim() || '';

    return {
      // Employee identification
      employeeIdNo: row['ID NO']?.toString().trim() || null,
      employeeName: row['NAME']?.toString().trim() || '',

      // Mobilization fields
      mobilizedTradeName: mobilizedTradeValue || null,
      clientName: row['CLIENT']?.toString().trim() || null,
      siteName: row['SITE']?.toString().trim() || null,
      mobStatus,
      jobStatus,
      actionDate: this.excelDateToISO(row['DATE']),
      notes: null,
    };
  }

  /**
   * Generates an Excel template for mobilization import
   * @returns Excel buffer
   */
  static generateTemplate(): Buffer {
    const templateData = [
      {
        'ID NO': 'EMP001',
        'MOBILIZED TRADE': 'Mason',
        CLIENT: 'ABC Company',
        SITE: 'Dubai Marina Project',
        STATUS: 'Active',
        'MOB-DEM': 'Mobilized',
        DATE: '2024-01-15',
      },
      {
        'ID NO': 'EMP002',
        'MOBILIZED TRADE': '',
        CLIENT: '',
        SITE: '',
        STATUS: 'On Vacation',
        'MOB-DEM': 'Demobilized',
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
      let reason = 'Active';
      if (mob.jobStatus === 'active') {
        reason = 'Active';
      } else if (mob.jobStatus === 'on_vacation') {
        reason = 'On Vacation';
      } else if (mob.jobStatus === 'cancelled') {
        reason = 'Cancelled';
      } else if (mob.jobStatus === 'absconded') {
        reason = 'Absconded';
      } else if (mob.jobStatus === 'absent') {
        reason = 'Absent';
      } else if (mob.jobStatus === 'sick_leave') {
        reason = 'Sick Leave';
      } else if (mob.jobStatus === 'casual_leave') {
        reason = 'Casual Leave';
      } else if (mob.jobStatus === 'notice_period') {
        reason = 'Notice Period';
      } else if (mob.jobStatus === 'resigned') {
        reason = 'Resigned';
      } else if (mob.jobStatus === 'idle') {
        reason = 'Idle';
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
