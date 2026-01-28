import { JobStatus } from '../../mobilizations/entities/mobilization.entity';

/**
 * Maps job status to short abbreviation (max 3 letters)
 */
export class StatusAbbreviationUtil {
  private static readonly abbreviations: Record<JobStatus, string> = {
    [JobStatus.ACTIVE]: 'ACT',
    [JobStatus.CANCELLED]: 'CAN',
    [JobStatus.ABSCONDED]: 'ABS',
    [JobStatus.ANNUAL_LEAVE]: 'AL',
    [JobStatus.ABSENT]: 'ABT',
    [JobStatus.SICK_LEAVE]: 'SL',
    [JobStatus.CASUAL_LEAVE]: 'CL',
    [JobStatus.URGENT_LEAVE]: 'UL',
    [JobStatus.NOTICE_PERIOD]: 'NP',
    [JobStatus.RESIGNED]: 'RES',
    [JobStatus.IDLE]: 'IDL',
    [JobStatus.OFF]: 'OFF',
  };

  /**
   * Get abbreviation for a job status
   * @param status Job status enum value
   * @returns Short abbreviation
   */
  static getAbbreviation(status: JobStatus): string {
    return this.abbreviations[status] || 'UNK';
  }

  /**
   * Get full status from abbreviation
   * @param abbreviation Short abbreviation
   * @returns Job status enum value or null
   */
  static getStatusFromAbbreviation(abbreviation: string): JobStatus | null {
    const entry = Object.entries(this.abbreviations).find(
      ([_, abbr]) => abbr === abbreviation.toUpperCase(),
    );
    return entry ? (entry[0] as JobStatus) : null;
  }

  /**
   * Get all abbreviations with their full status
   * @returns Map of abbreviation to job status
   */
  static getAllAbbreviations(): Record<string, JobStatus> {
    const result: Record<string, JobStatus> = {};
    Object.entries(this.abbreviations).forEach(([status, abbr]) => {
      result[abbr] = status as JobStatus;
    });
    return result;
  }
}

