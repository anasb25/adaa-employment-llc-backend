/**
 * Timezone-neutral date utilities
 * These utilities ensure dates are treated as calendar dates without timezone conversion
 */

/**
 * Parses a date string (YYYY-MM-DD) to a Date object at UTC midnight
 * This ensures the date doesn't shift due to timezone conversions
 */
export function parseDateOnly(dateStr: string): Date {
  if (!dateStr) {
    throw new Error('Date string is required');
  }

  // Parse as YYYY-MM-DD and create at UTC midnight
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date values: ${dateStr}`);
  }

  // Create date at UTC midnight to avoid timezone shifts
  return new Date(Date.UTC(year, month, day));
}

/**
 * Formats a Date object to YYYY-MM-DD string (timezone-neutral)
 */
export function formatDateOnly(date: Date | string): string {
  if (!date) {
    throw new Error('Date is required');
  }

  // If already a string in correct format, return as-is
  if (typeof date === 'string') {
    const match = date.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Use UTC methods to avoid timezone conversion
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Compares two dates (ignoring time component)
 * Returns: -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDateOnly(date1: Date | string, date2: Date | string): number {
  const str1 = formatDateOnly(date1);
  const str2 = formatDateOnly(date2);

  if (str1 < str2) return -1;
  if (str1 > str2) return 1;
  return 0;
}

/**
 * Checks if two dates are equal (ignoring time component)
 */
export function areDatesEqual(date1: Date | string, date2: Date | string): boolean {
  return formatDateOnly(date1) === formatDateOnly(date2);
}

/**
 * Checks if date1 is less than or equal to date2 (ignoring time component)
 */
export function isDateLessThanOrEqual(date1: Date | string, date2: Date | string): boolean {
  return compareDateOnly(date1, date2) <= 0;
}

/**
 * Converts Excel date serial number to YYYY-MM-DD string (timezone-neutral)
 */
export function excelSerialToDateString(serial: any): string | null {
  if (!serial) return null;

  // If it's already a string in YYYY-MM-DD format, return as-is
  if (typeof serial === 'string') {
    const match = serial.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }

    // Try to parse as date and format (handles various string formats)
    try {
      const date = new Date(serial);
      if (!isNaN(date.getTime())) {
        return formatDateOnly(date);
      }
    } catch (e) {
      return null;
    }
  }

  // If it's a number (Excel date serial)
  if (typeof serial === 'number') {
    // Excel epoch: December 30, 1899
    const excelEpochDays = 25569; // Days between Dec 30, 1899 and Unix epoch (Jan 1, 1970)
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    
    // Convert Excel serial to Unix timestamp
    const unixTimestamp = (serial - excelEpochDays) * millisecondsPerDay;
    const date = new Date(unixTimestamp);
    
    return formatDateOnly(date);
  }

  return null;
}

/**
 * Gets the start of month (YYYY-MM-DD) for a given date
 */
export function getMonthStart(date: Date | string): string {
  const dateStr = formatDateOnly(date);
  const [year, month] = dateStr.split('-');
  return `${year}-${month}-01`;
}

/**
 * Gets the end of month (YYYY-MM-DD) for a given date
 */
export function getMonthEnd(date: Date | string): string {
  const dateStr = formatDateOnly(date);
  const [year, month] = dateStr.split('-').map(Number);
  
  // Last day of month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Converts a month string (YYYY-MM) to date range
 */
export function getMonthDateRange(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number);
  
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  
  // Last day of month
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  return { start: startDate, end: endDate };
}

