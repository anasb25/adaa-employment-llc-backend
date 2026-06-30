// import { MigrationInterface, QueryRunner } from 'typeorm';

// /**
//  * Allow one "idle" timesheet per month (projectId = NULL) for idle employees.
//  * - projectId nullable
//  * - One idle timesheet per month: unique (month) WHERE projectId IS NULL
//  * - Keep one per (projectId, month) for project timesheets: unique (projectId, month) WHERE projectId IS NOT NULL
//  */
// export class TimesheetsIdleNullableProjectId1773162600007
//   implements MigrationInterface
// {
//   name = 'TimesheetsIdleNullableProjectId1773162600007';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     await queryRunner.query(
//       `DROP INDEX "public"."IDX_cd63aacbf92be046f007ae9ca5"`,
//     );
//     await queryRunner.query(
//       `ALTER TABLE "timesheets" ALTER COLUMN "projectId" DROP NOT NULL`,
//     );
//     await queryRunner.query(
//       `CREATE UNIQUE INDEX "IDX_timesheets_project_month" ON "timesheets" ("projectId", "month") WHERE "projectId" IS NOT NULL`,
//     );
//     await queryRunner.query(
//       `CREATE UNIQUE INDEX "IDX_timesheets_month_idle" ON "timesheets" ("month") WHERE "projectId" IS NULL`,
//     );
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     await queryRunner.query(
//       `DROP INDEX "public"."IDX_timesheets_month_idle"`,
//     );
//     await queryRunner.query(
//       `DROP INDEX "public"."IDX_timesheets_project_month"`,
//     );
//     await queryRunner.query(
//       `ALTER TABLE "timesheets" ALTER COLUMN "projectId" SET NOT NULL`,
//     );
//     await queryRunner.query(
//       `CREATE UNIQUE INDEX "IDX_cd63aacbf92be046f007ae9ca5" ON "timesheets" ("projectId", "month")`,
//     );
//   }
// }
