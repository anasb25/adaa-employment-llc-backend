import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TimesheetsService } from './timesheets.service';

@Injectable()
export class TimesheetsCronService {
  private readonly logger = new Logger(TimesheetsCronService.name);

  constructor(private readonly timesheetsService: TimesheetsService) {}

  /**
   * Auto-generate daily timesheets every day at 00:00 UAE time (GMT+4)
   * Cron expression: '0 0 * * *' in UTC+4 timezone
   * This translates to 20:00 UTC (midnight UAE time)
   */
  @Cron('0 20 * * *', {
    name: 'generate-daily-timesheets',
    timeZone: 'UTC', // Run at 20:00 UTC = 00:00 UAE (GMT+4)
  })
  async handleDailyTimesheetGeneration() {
    const today = new Date();
    const uaeDate = new Date(today.getTime() + 4 * 60 * 60 * 1000); // Add 4 hours for UAE time
    const dateStr = uaeDate.toISOString().split('T')[0];

    this.logger.log(
      `Starting daily timesheet generation for date: ${dateStr} (UAE time: ${uaeDate.toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })})`,
    );

    try {
      const result = await this.timesheetsService.generateDailyTimesheets(
        dateStr,
        1, // System user ID - you can change this to your system user
      );

      this.logger.log(
        `✅ Daily timesheet generation completed: ${result.created} created, ${result.existing} already existed`,
      );

      // Additional logging for monitoring
      if (result.created > 0) {
        this.logger.log(
          `📊 New timesheets created for ${result.created} employees`,
        );
      }
      if (result.existing > 0) {
        this.logger.log(
          `ℹ️  ${result.existing} timesheets already existed (skipped)`,
        );
      }
    } catch (error) {
      // Failsafe: Log error but don't crash the application
      this.logger.error(
        `❌ Failed to generate daily timesheets: ${error.message}`,
        error.stack,
      );

      // You can add additional error handling here:
      // - Send alert email
      // - Send Slack notification
      // - Write to error log file
      // - Retry logic (optional)
    }
  }

  /**
   * Manual trigger for testing (can be called via admin endpoint)
   */
  async triggerManually(date?: string): Promise<any> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    this.logger.log(
      `🔧 Manual trigger: Generating timesheets for ${targetDate}`,
    );

    try {
      const result = await this.timesheetsService.generateDailyTimesheets(
        targetDate,
        1,
      );

      this.logger.log(
        `✅ Manual generation completed: ${result.created} created, ${result.existing} existing`,
      );

      return result;
    } catch (error) {
      this.logger.error(`❌ Manual generation failed: ${error.message}`);
      throw error;
    }
  }
}
