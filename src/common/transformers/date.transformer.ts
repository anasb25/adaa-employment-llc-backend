import { ValueTransformer } from 'typeorm';
import { formatDateOnly } from '../utils/date.util';

/**
 * TypeORM transformer for date columns to ensure timezone-neutral handling
 * Stores dates as DATE type in database and returns them as YYYY-MM-DD strings
 */
export const DateOnlyTransformer: ValueTransformer = {
  /**
   * Transforms value from entity to database
   * Accepts Date object or YYYY-MM-DD string
   */
  to(value: Date | string | null): Date | null {
    if (!value) return null;

    if (typeof value === 'string') {
      // Parse YYYY-MM-DD string to Date at UTC midnight
      const parts = value.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return new Date(Date.UTC(year, month, day));
      }
    }

    // If it's already a Date object, return as-is
    return value instanceof Date ? value : null;
  },

  /**
   * Transforms value from database to entity
   * Always returns YYYY-MM-DD string to avoid timezone issues
   */
  from(value: Date | string | null): string | null {
    if (!value) return null;

    try {
      // Format as YYYY-MM-DD string
      return formatDateOnly(value);
    } catch (e) {
      return null;
    }
  },
};

