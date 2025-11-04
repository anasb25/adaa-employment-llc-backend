import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class CronjobsService {
  private readonly logger = new Logger(CronjobsService.name);

  // Example cron job - runs every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCron() {
    this.logger.log('Running scheduled task: Daily midnight job');
    // Add your scheduled task logic here
  }
}
