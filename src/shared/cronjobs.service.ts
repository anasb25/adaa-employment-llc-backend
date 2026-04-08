import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../modules/employees/entities/employee.entity';
import { Mobilization, JobStatus } from '../modules/mobilizations/entities/mobilization.entity';

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
   * Updates air tickets and annual leave balance for employees
   * Runs daily at 1 AM to check if any employee has completed another year of service
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
        const yearsOfService = (endDate.getTime() - joinDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const expectedAirTickets = Math.floor(yearsOfService);
        const expectedAnnualLeave = Math.floor(yearsOfService) * 30;

        if (
          employee.air_tickets !== expectedAirTickets ||
          employee.annual_leave_balance !== expectedAnnualLeave
        ) {
          await this.employeeRepository.update(employee.id, {
            air_tickets: expectedAirTickets,
            annual_leave_balance: expectedAnnualLeave,
          });
          updatedCount++;
          this.logger.debug(
            `Updated employee ${employee.id} (${employee.name}): Air tickets: ${employee.air_tickets} -> ${expectedAirTickets}, Annual leave: ${employee.annual_leave_balance} -> ${expectedAnnualLeave}`,
          );
        }
      }

      this.logger.log(
        `Completed: Updated air tickets and annual leave balance for ${updatedCount} employee(s)`,
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
      .andWhere('mob.deletedAt IS NULL')
      .groupBy('mob.employeeId')
      .getRawMany();

    for (const row of cancelledMobs) {
      map.set(row.mob_employeeId, new Date(row.cancellationDate));
    }
    return map;
  }
}
