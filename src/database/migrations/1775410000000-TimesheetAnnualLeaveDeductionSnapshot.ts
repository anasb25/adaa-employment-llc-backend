import { MigrationInterface, QueryRunner } from 'typeorm';

export class TimesheetAnnualLeaveDeductionSnapshot1775410000000
  implements MigrationInterface
{
  name = 'TimesheetAnnualLeaveDeductionSnapshot1775410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD COLUMN IF NOT EXISTS "annualLeaveDeductionApplied" jsonb`,
    );

    await queryRunner.query(`
      COMMENT ON COLUMN "timesheets"."annualLeaveDeductionApplied" IS
        'Annual leave days last deducted on approve per employee (JSON { employeeIdStr: days }). Reverted then replaced on each approval.';
    `);

    // Approved sheets only: snapshot current AL entry counts so the next approve
    // reconciles credits+debits without double-charging historically deducted leave.
    await queryRunner.query(`
      UPDATE "timesheets" t
      SET "annualLeaveDeductionApplied" = agg.snap
      FROM (
        SELECT
          te_inner."timesheetId" AS tid,
          COALESCE(jsonb_object_agg(te_inner."employeeId"::text, te_inner.cnt), '{}'::jsonb) AS snap
        FROM (
          SELECT "timesheetId", "employeeId", COUNT(*)::int AS cnt
          FROM "timesheet_entries"
          WHERE "jobStatus"::text = 'annual_leave'
          GROUP BY "timesheetId", "employeeId"
        ) te_inner
        GROUP BY te_inner."timesheetId"
      ) agg
      WHERE t.id = agg.tid AND t.status::text = 'approved'
    `);

    await queryRunner.query(`
      UPDATE "timesheets"
      SET "annualLeaveDeductionApplied" = '{}'::jsonb
      WHERE status::text = 'approved' AND "annualLeaveDeductionApplied" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "timesheets" DROP COLUMN IF EXISTS "annualLeaveDeductionApplied"`,
    );
  }
}
