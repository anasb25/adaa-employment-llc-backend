import { MigrationInterface, QueryRunner } from "typeorm";

export class TimesheetsModded1766436898285 implements MigrationInterface {
    name = 'TimesheetsModded1766436898285'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_c76053d0a3bf462efae3fb125f4"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_ff114055c64570460686de37c8e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_37df6bcfbd250f15e158417181"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheet_entries_jobstatus_enum" AS ENUM('active', 'on_vacation', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle', 'demobilized')`);
        await queryRunner.query(`CREATE TABLE "timesheet_entries" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "timesheetId" integer NOT NULL, "employeeId" integer NOT NULL, "date" date NOT NULL, "tradeInSiteId" integer, "hoursWorked" numeric(5,2) NOT NULL DEFAULT '0', "jobStatus" "public"."timesheet_entries_jobstatus_enum" NOT NULL DEFAULT 'active', "notes" text, CONSTRAINT "PK_25a8a9b6a96e72864d598563c56" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9b0187437c467c76b7ba7f5aa3" ON "timesheet_entries" ("timesheetId", "employeeId", "date") `);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "date"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "tradeInSiteId"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "hoursWorked"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "employeeId"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "jobStatus"`);
        await queryRunner.query(`DROP TYPE "public"."timesheets_jobstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "month" character varying(7) NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."timesheets_status_enum" AS ENUM('draft', 'submitted', 'approved', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "status" "public"."timesheets_status_enum" NOT NULL DEFAULT 'draft'`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "submittedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "submittedBy" integer`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "approvedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "approvedBy" integer`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cd63aacbf92be046f007ae9ca5" ON "timesheets" ("projectId", "month") `);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ADD CONSTRAINT "FK_2d6af47ea3d0f717cbd72aaf83c" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ADD CONSTRAINT "FK_ef6c7acf40736121b59be42d3f5" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" ADD CONSTRAINT "FK_2d248e96054fb34a90779c18908" FOREIGN KEY ("tradeInSiteId") REFERENCES "skills"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheet_entries" DROP CONSTRAINT "FK_2d248e96054fb34a90779c18908"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" DROP CONSTRAINT "FK_ef6c7acf40736121b59be42d3f5"`);
        await queryRunner.query(`ALTER TABLE "timesheet_entries" DROP CONSTRAINT "FK_2d6af47ea3d0f717cbd72aaf83c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cd63aacbf92be046f007ae9ca5"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "approvedBy"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "approvedAt"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "submittedBy"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "submittedAt"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."timesheets_status_enum"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "month"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheets_jobstatus_enum" AS ENUM('active', 'on_vacation', 'cancelled', 'absconded', 'absent', 'sick_leave', 'casual_leave', 'notice_period', 'resigned', 'idle')`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "jobStatus" "public"."timesheets_jobstatus_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "employeeId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "hoursWorked" numeric(5,2) NOT NULL DEFAULT '10'`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "tradeInSiteId" integer`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "date" date NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9b0187437c467c76b7ba7f5aa3"`);
        await queryRunner.query(`DROP TABLE "timesheet_entries"`);
        await queryRunner.query(`DROP TYPE "public"."timesheet_entries_jobstatus_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_37df6bcfbd250f15e158417181" ON "timesheets" ("date", "employeeId", "projectId") `);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_ff114055c64570460686de37c8e" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_c76053d0a3bf462efae3fb125f4" FOREIGN KEY ("tradeInSiteId") REFERENCES "skills"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
