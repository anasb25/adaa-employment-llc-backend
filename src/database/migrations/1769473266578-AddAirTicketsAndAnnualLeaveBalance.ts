import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAirTicketsAndAnnualLeaveBalance1769473266578 implements MigrationInterface {
    name = 'AddAirTicketsAndAnnualLeaveBalance1769473266578'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" ADD "air_tickets" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "employees"."air_tickets" IS 'Air tickets count - auto-increments every year from date of joining'`);
        await queryRunner.query(`ALTER TABLE "employees" ADD "annual_leave_balance" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "employees"."annual_leave_balance" IS 'Annual leave balance in days - auto-adds 30 days every year from date of joining'`);
        await queryRunner.query(`ALTER TYPE "public"."employees_status_enum" RENAME TO "employees_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum" AS ENUM('active', 'annual_leave')`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" TYPE "public"."employees_status_enum" USING (CASE WHEN "status" = 'on_vacation' THEN 'annual_leave' ELSE "status" END)::text::"public"."employees_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."timesheet_entries_jobstatus_enum" RENAME TO "timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheet_entries_jobstatus_enum" AS ENUM('active', 'annual_leave', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'urgent_leave', 'notice_period', 'resigned', 'idle', 'demobilized', 'off')`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" TYPE "public"."timesheet_entries_jobstatus_enum" USING (CASE WHEN "jobStatus" = 'on_vacation' THEN 'annual_leave' ELSE "jobStatus" END)::text::"public"."timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum" RENAME TO "mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum" AS ENUM('active', 'cancelled', 'absconded', 'annual_leave', 'absent', 'sick_leave', 'casual_leave', 'urgent_leave', 'notice_period', 'resigned', 'idle', 'off')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum" USING (CASE WHEN "jobStatus" = 'on_vacation' THEN 'annual_leave' ELSE "jobStatus" END)::text::"public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum_old" AS ENUM('active', 'cancelled', 'absconded', 'on_vacation', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'off')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum_old" USING "jobStatus"::"text"::"public"."mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum_old" RENAME TO "mobilizations_jobstatus_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheet_entries_jobstatus_enum_old" AS ENUM('active', 'on_vacation', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'demobilized', 'off')`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" TYPE "public"."timesheet_entries_jobstatus_enum_old" USING "jobStatus"::"text"::"public"."timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."timesheet_entries_jobstatus_enum_old" RENAME TO "timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum_old" AS ENUM('active', 'on_vacation')`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" TYPE "public"."employees_status_enum_old" USING "status"::"text"::"public"."employees_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."employees_status_enum_old" RENAME TO "employees_status_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "employees"."annual_leave_balance" IS 'Annual leave balance in days - auto-adds 30 days every year from date of joining'`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "annual_leave_balance"`);
        await queryRunner.query(`COMMENT ON COLUMN "employees"."air_tickets" IS 'Air tickets count - auto-increments every year from date of joining'`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "air_tickets"`);
    }

}
