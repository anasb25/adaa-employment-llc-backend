import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnnualLeaveAccruedMonths1775300000000 implements MigrationInterface {
  name = 'AddAnnualLeaveAccruedMonths1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the tracking column (nullable + default 0 so existing rows are valid).
    await queryRunner.query(
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "annual_leave_accrued_months" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."annual_leave_accrued_months" IS 'Cumulative number of completed service months already credited to annual_leave_balance by the accrual cron. Prevents double-crediting and preserves timesheet deductions.'`,
    );

    // 2. Backfill: trust each employee's current annual_leave_balance as-is.
    //    We set accrued_months to whatever is currently "earned" for them, so
    //    the cron will not retroactively add anything on its next run. Any
    //    timesheet deductions already reflected in annual_leave_balance are
    //    preserved untouched.
    //
    //    A month is considered completed once the day-of-month of today is
    //    >= the day-of-month of date_of_joining (matches the app-level
    //    completedMonthsBetween helper).
    await queryRunner.query(`
      UPDATE "employees"
      SET "annual_leave_accrued_months" = GREATEST(
        0,
        (EXTRACT(YEAR FROM AGE(CURRENT_DATE, "date_of_joining")) * 12
         + EXTRACT(MONTH FROM AGE(CURRENT_DATE, "date_of_joining")))::int
      )
      WHERE "date_of_joining" IS NOT NULL
    `);

    // 3. Also refresh the updated comment on annual_leave_balance.
    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."annual_leave_balance" IS 'Annual leave balance in days - accrues 2.5 days per completed month of service from date of joining (30 days/year). Reduced by approved annual-leave timesheet entries.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "annual_leave_accrued_months"`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."annual_leave_balance" IS 'Annual leave balance in days - auto-adds 30 days every year from date of joining'`,
    );
  }
}
