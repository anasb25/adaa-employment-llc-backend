import * as XLSX from 'xlsx';
import {
  excelSerialToDateString,
  formatDateOnly,
} from '../../../common/utils/date.util';

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
   * Converts Excel date serial number to ISO date string (timezone-neutral)
   * @param serial Excel date serial
   * @returns ISO date string or null
   */
  static excelDateToISO(serial: any): string | null {
    // Use the centralized timezone-neutral date utility
    return excelSerialToDateString(serial);
  }

  /**
   * Maps Excel row data to mobilization data
   * @param row Excel row
   * @returns Mapped mobilization data with validation info
   */
  static mapRowToMobilization(row: any): any {
    const originalStatusValue = row['STATUS']?.toString().trim() || '';
    const originalMobDemValue = row['MOB-DEM']?.toString().trim() || '';

    // Map MOB-DEM to mobStatus
    const mobDemValue = originalMobDemValue.toLowerCase();
    let mobStatus: string | null = null;
    let mobStatusValid = false;

    // Use exact match to avoid "demobilized" matching "mobilized"
    if (mobDemValue === 'mobilized') {
      mobStatus = 'mobilized';
      mobStatusValid = true;
    } else if (mobDemValue === 'demobilized') {
      mobStatus = 'demobilized';
      mobStatusValid = true;
    }

    // Map STATUS to jobStatus with strict validation
    const statusValue = originalStatusValue.toLowerCase();
    let jobStatus: string | null = null;
    let jobStatusValid = false;

    // Check for valid status values (case-insensitive, partial match for flexibility)
    if (statusValue.includes('active')) {
      jobStatus = 'active';
      jobStatusValid = true;
    } else if (
      statusValue.includes('annual') ||
      statusValue.includes('vacation') ||
      statusValue.includes('on vacation')
    ) {
      jobStatus = 'annual_leave';
      jobStatusValid = true;
    } else if (statusValue.includes('cancel')) {
      jobStatus = 'cancelled';
      jobStatusValid = true;
    } else if (statusValue.includes('abscond')) {
      jobStatus = 'absconded';
      jobStatusValid = true;
    } else if (statusValue.includes('sick')) {
      jobStatus = 'sick_leave';
      jobStatusValid = true;
    } else if (statusValue.includes('casual')) {
      jobStatus = 'casual_leave';
      jobStatusValid = true;
    } else if (statusValue.includes('urgent')) {
      jobStatus = 'urgent_leave';
      jobStatusValid = true;
    } else if (statusValue.includes('notice')) {
      jobStatus = 'notice_period';
      jobStatusValid = true;
    } else if (statusValue.includes('resign')) {
      jobStatus = 'resigned';
      jobStatusValid = true;
    } else if (statusValue.includes('absent')) {
      jobStatus = 'absent';
      jobStatusValid = true;
    } else if (statusValue.includes('idle')) {
      jobStatus = 'idle';
      jobStatusValid = true;
    } else if (statusValue.includes('off')) {
      jobStatus = 'off';
      jobStatusValid = true;
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

      // Validation info
      _validation: {
        originalStatus: originalStatusValue,
        originalMobDem: originalMobDemValue,
        jobStatusValid,
        mobStatusValid,
      },
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
        STATUS: 'Idle',
        'MOB-DEM': 'Demobilized',
        DATE: '2024-01-20',
      },
    ];

    // Create instructions sheet with valid values
    const instructionsData = [
      {
        Field: 'ID NO',
        Description: 'Employee ADAA Code (Required)',
        'Valid Values': 'Any valid employee code',
      },
      {
        Field: 'MOBILIZED TRADE',
        Description: 'Trade/Skill for mobilization',
        'Valid Values': 'Any trade name',
      },
      {
        Field: 'CLIENT',
        Description: 'Client name (Required when MOB-DEM is Mobilized)',
        'Valid Values': 'Any client name',
      },
      {
        Field: 'SITE',
        Description: 'Site/Project name (Required when MOB-DEM is Mobilized)',
        'Valid Values': 'Any site name',
      },
      {
        Field: 'STATUS',
        Description: 'Job Status (Required)',
        'Valid Values':
          'Active, Annual Leave, Urgent Leave, Cancelled, Absconded, Absent, Sick Leave, Casual Leave, Notice Period, Resigned, Idle',
      },
      {
        Field: 'MOB-DEM',
        Description: 'Mobilization Status (Required)',
        'Valid Values': 'Mobilized, Demobilized',
      },
      {
        Field: 'DATE',
        Description: 'Action Date (Required)',
        'Valid Values': 'YYYY-MM-DD format (e.g., 2024-01-15)',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobilizations');
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

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
      } else if (mob.jobStatus === 'annual_leave') {
        reason = 'Annual Leave';
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
      } else if (mob.jobStatus === 'urgent_leave') {
        reason = 'Urgent Leave';
      } else if (mob.jobStatus === 'notice_period') {
        reason = 'Notice Period';
      } else if (mob.jobStatus === 'resigned') {
        reason = 'Resigned';
      } else if (mob.jobStatus === 'idle') {
        reason = 'Idle';
      } else if (mob.jobStatus === 'off') {
        reason = 'Off';
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
        DATE: mob.actionDate ? formatDateOnly(mob.actionDate) : '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobilizations');

    // Generate buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
