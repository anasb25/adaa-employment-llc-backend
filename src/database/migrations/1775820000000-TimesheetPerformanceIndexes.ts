import { MigrationInterface, QueryRunner } from 'typeorm';

export class TimesheetPerformanceIndexes1775820000000
  implements MigrationInterface
{
  name = 'TimesheetPerformanceIndexes1775820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mobilizations_employee_actionDate"
      ON "mobilizations" ("employeeId", "actionDate" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheet_entries_timesheet_employee_date"
      ON "timesheet_entries" ("timesheetId", "employeeId", "date")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheets_month_project"
      ON "timesheets" ("month", "projectId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheets_month_project"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheet_entries_timesheet_employee_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mobilizations_employee_actionDate"`,
    );
  }
}
