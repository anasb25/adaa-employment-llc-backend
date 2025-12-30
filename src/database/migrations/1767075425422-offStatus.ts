import { MigrationInterface, QueryRunner } from "typeorm";

export class OffStatus1767075425422 implements MigrationInterface {
    name = 'OffStatus1767075425422'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."timesheet_entries_jobstatus_enum" RENAME TO "timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheet_entries_jobstatus_enum" AS ENUM('active', 'on_vacation', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'demobilized', 'off')`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" TYPE "public"."timesheet_entries_jobstatus_enum" USING "jobStatus"::"text"::"public"."timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum" RENAME TO "mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum" AS ENUM('active', 'cancelled', 'absconded', 'on_vacation', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'off')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum" USING "jobStatus"::"text"::"public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."mobilizations_jobstatus_enum_old" AS ENUM('active', 'cancelled', 'absconded', 'on_vacation', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle')`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" TYPE "public"."mobilizations_jobstatus_enum_old" USING "jobStatus"::"text"::"public"."mobilizations_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "mobilizations" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."mobilizations_jobstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."mobilizations_jobstatus_enum_old" RENAME TO "mobilizations_jobstatus_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheet_entries_jobstatus_enum_old" AS ENUM('active', 'on_vacation', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'demobilized')`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" TYPE "public"."timesheet_entries_jobstatus_enum_old" USING "jobStatus"::"text"::"public"."timesheet_entries_jobstatus_enum_old"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ALTER COLUMN "jobStatus" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."timesheet_entries_jobstatus_enum_old" RENAME TO "timesheet_entries_jobstatus_enum"`);
    }

}
