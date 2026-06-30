import * as XLSX from 'xlsx';

export interface AllowanceDeductionRow {
  idNo: string;
  allowanceName?: string;
  allowanceValue?: number;
  deductionName?: string;
  deductionValue?: number;
}

export interface ParsedAllowancesDeductions {
  employeeId: string; // ID NO
  allowances: Array<{ name: string; value: number }>;
  deductions: Array<{ name: string; value: number }>;
}

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  data?: ParsedAllowancesDeductions[];
}

export class AllowanceDeductionExcelValidator {
  /**
   * Validates and parses the Excel file for allowances/deductions
   */
  static validateAndParseExcelFile(buffer: Buffer): ExcelValidationResult {
    const errors: string[] = [];

    try {
      // Parse the Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        errors.push('No sheets found in the Excel file');
        return { isValid: false, errors };
      }

      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
      });

      if (rawData.length === 0) {
        errors.push('Excel file is empty');
        return { isValid: false, errors };
      }

      // Validate required columns exist
      const firstRow = rawData[0];
      const requiredColumns = ['ID NO'];
      const optionalColumns = [
        'Allowance',
        'Allowance Value',
        'Deduction',
        'Deduction Value',
      ];

      for (const col of requiredColumns) {
        if (!(col in firstRow)) {
          errors.push(`Missing required column: "${col}"`);
        }
      }

      if (errors.length > 0) {
        return { isValid: false, errors };
      }

      // Group rows by employee ID NO
      const employeeMap = new Map<string, ParsedAllowancesDeductions>();

      rawData.forEach((row, index) => {
        const rowNumber = index + 2; // +2 for Excel 1-indexed + header row
        const idNo = String(row['ID NO'] || '').trim();

        if (!idNo) {
          errors.push(`Row ${rowNumber}: Missing ID NO`);
          return;
        }

        // Get or create employee entry
        if (!employeeMap.has(idNo)) {
          employeeMap.set(idNo, {
            employeeId: idNo,
            allowances: [],
            deductions: [],
          });
        }

        const employee = employeeMap.get(idNo)!;

        // Parse allowance
        const allowanceName = String(row['Allowance'] || '').trim();
        const allowanceValue = row['Allowance Value'];

        if (allowanceName && allowanceValue) {
          const value = Number(allowanceValue);
          if (isNaN(value) || value < 0) {
            errors.push(
              `Row ${rowNumber}: Invalid Allowance Value for "${allowanceName}"`,
            );
          } else {
            employee.allowances.push({
              name: allowanceName,
              value,
            });
          }
        }

        // Parse deduction
        const deductionName = String(row['Deduction'] || '').trim();
        const deductionValue = row['Deduction Value'];

        if (deductionName && deductionValue) {
          const value = Number(deductionValue);
          if (isNaN(value) || value < 0) {
            errors.push(
              `Row ${rowNumber}: Invalid Deduction Value for "${deductionName}"`,
            );
          } else {
            employee.deductions.push({
              name: deductionName,
              value,
            });
          }
        }
      });

      const data = Array.from(employeeMap.values());

      return {
        isValid: errors.length === 0,
        errors,
        data,
      };
    } catch (error: any) {
      errors.push(`Failed to parse Excel file: ${error.message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Generates an Excel template for allowances/deductions import
   */
  static generateTemplate(): Buffer {
    const templateData = [
      {
        'ID NO': '2',
        Allowance: 'Food',
        'Allowance Value': 50,
        Deduction: 'Loan',
        'Deduction Value': 200,
      },
      {
        'ID NO': '4',
        Allowance: 'Mobile',
        'Allowance Value': 20,
        Deduction: '',
        'Deduction Value': '',
      },
      {
        'ID NO': '2',
        Allowance: 'Transport',
        'Allowance Value': 100,
        Deduction: '',
        'Deduction Value': '',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Allowances & Deductions',
    );

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
