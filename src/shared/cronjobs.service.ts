import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../modules/employees/entities/employee.entity';
import { Mobilization, JobStatus } from '../modules/mobilizations/entities/mobilization.entity';
import {
  completedMonthsBetween,
  MONTHLY_LEAVE_ACCRUAL,
} from '../common/utils/date.util';

@Injectable()
export class CronjobsService {
  private readonly logger = new Logger(CronjobsService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Mobilization)
    private readonly mobilizationRepository: Repository<Mobilization>,
  ) {}

  // Example cron job - runs every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleCron() {
    this.logger.log('Running scheduled task: Daily midnight job');
    // Add your scheduled task logic here
  }

  /**
   * Updates air tickets and annual leave balance for employees.
   *
   * Runs daily at 1 AM.
   *
   * Accrual rules:
   *   - Air tickets: set to the number of fully completed years of service.
   *   - Annual leave: +2.5 days per newly completed calendar month of service
   *     since the last run (30 days/year, prorated monthly).
   *
   * Incremental accrual design:
   *   `annual_leave_accrued_months` tracks how many completed service months
   *   have already been credited to `annual_leave_balance`. Each run we compute
   *   the delta and add only the newly earned days. This preserves any
   *   deductions made elsewhere (e.g. approved annual-leave timesheets) and
   *   makes the cron idempotent within a month.
   *
   * Service length is measured from `date_of_joining` up to either today or,
   * if the employee has been cancelled, the latest cancellation action date.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async updateEmployeeAirTicketsAndAnnualLeave() {
    this.logger.log('Running scheduled task: Update employee air tickets and annual leave balance');

    try {
      const employees = await this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.date_of_joining IS NOT NULL')
        .getMany();

      const employeeIds = employees.map((e) => e.id);
      const cancellationDateMap = await this.getCancellationDates(employeeIds);

      const today = new Date();
      let updatedCount = 0;

      for (const employee of employees) {
        if (!employee.date_of_joining) continue;

        const joinDate = new Date(employee.date_of_joining);
        const endDate = cancellationDateMap.get(employee.id) ?? today;

        const yearsOfService =
          (endDate.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const expectedAirTickets = Math.max(0, Math.floor(yearsOfService));

        const expectedMonths = completedMonthsBetween(joinDate, endDate);
        const alreadyAccruedMonths = Number(employee.annual_leave_accrued_months ?? 0);
        const newMonths = expectedMonths - alreadyAccruedMonths;

        const updates: Partial<Employee> = {};

        if (employee.air_tickets !== expectedAirTickets) {
          updates.air_tickets = expectedAirTickets;
        }

        if (newMonths > 0) {
          const currentBalance = Number(employee.annual_leave_balance ?? 0);
          const addedDays = newMonths * MONTHLY_LEAVE_ACCRUAL;
          const newBalance =
            Math.round((currentBalance + addedDays) * 100) / 100;
          updates.annual_leave_balance = newBalance;
          updates.annual_leave_accrued_months = expectedMonths;

          this.logger.debug(
            `Accrued ${addedDays} day(s) to employee ${employee.id} (${employee.name}): balance ${currentBalance} -> ${newBalance}, months ${alreadyAccruedMonths} -> ${expectedMonths}`,
          );
        } else if (newMonths < 0) {
          // Stored accrued_months is ahead of actual service length (e.g. an
          // admin corrected date_of_joining backward). Re-sync the counter
          // without touching the balance, so future accruals resume cleanly.
          updates.annual_leave_accrued_months = expectedMonths;
          this.logger.warn(
            `Resynced annual_leave_accrued_months for employee ${employee.id} (${employee.name}): ${alreadyAccruedMonths} -> ${expectedMonths} (balance unchanged)`,
          );
        }

        if (Object.keys(updates).length > 0) {
          await this.employeeRepository.update(employee.id, updates);
          updatedCount++;
        }
      }

      this.logger.log(
        `Completed: Updated air tickets and/or annual leave for ${updatedCount} employee(s)`,
      );
    } catch (error) {
      this.logger.error(
        'Error updating employee air tickets and annual leave balance:',
        error,
      );
    }
  }

  /**
   * For each employee, find their latest cancelled mobilization actionDate.
   * Returns a map of employeeId -> cancellation Date.
   */
  private async getCancellationDates(employeeIds: number[]): Promise<Map<number, Date>> {
    const map = new Map<number, Date>();
    if (employeeIds.length === 0) return map;

    const cancelledMobs = await this.mobilizationRepository
      .createQueryBuilder('mob')
      .select(['mob.employeeId', 'MAX(mob.actionDate) as "cancellationDate"'])
      .where('mob.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('mob.jobStatus = :status', { status: JobStatus.CANCELLED })
      .groupBy('mob.employeeId')
      .getRawMany();

    for (const row of cancelledMobs) {
      map.set(row.mob_employeeId, new Date(row.cancellationDate));
    }
    return map;
  }
}
