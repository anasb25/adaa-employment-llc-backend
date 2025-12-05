import { MigrationInterface, QueryRunner } from "typeorm";

export class Timesheet21764676480753 implements MigrationInterface {
    name = 'Timesheet21764676480753'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_9256f2dd8687244df8254a8e571"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "skillWorkedId"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "tradeInSiteId" integer`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."timesheets_status_enum"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "status" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "hoursWorked"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "hoursWorked" numeric(5,2) NOT NULL DEFAULT '10'`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_c76053d0a3bf462efae3fb125f4" FOREIGN KEY ("tradeInSiteId") REFERENCES "skills"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_c76053d0a3bf462efae3fb125f4"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "hoursWorked"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "hoursWorked" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."timesheets_status_enum" AS ENUM('accepted_allocated_skill', 'accepted_different_skill', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "status" "public"."timesheets_status_enum" NOT NULL DEFAULT 'accepted_allocated_skill'`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "tradeInSiteId"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "skillWorkedId" integer`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_9256f2dd8687244df8254a8e571" FOREIGN KEY ("skillWorkedId") REFERENCES "skills"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
