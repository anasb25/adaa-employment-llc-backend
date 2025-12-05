import { MigrationInterface, QueryRunner } from "typeorm";

export class Timesheet1764671508480 implements MigrationInterface {
    name = 'Timesheet1764671508480'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."timesheets_status_enum" AS ENUM('accepted_allocated_skill', 'accepted_different_skill', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "timesheets" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "allocationId" integer NOT NULL, "date" date NOT NULL, "status" "public"."timesheets_status_enum" NOT NULL DEFAULT 'accepted_allocated_skill', "skillWorkedId" integer, "hoursWorked" integer NOT NULL DEFAULT '0', "notes" text, CONSTRAINT "PK_1dc280b68c9353ecce41a34be71" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_fed98306025b521cb7b4d3617d7" FOREIGN KEY ("allocationId") REFERENCES "project_allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_9256f2dd8687244df8254a8e571" FOREIGN KEY ("skillWorkedId") REFERENCES "skills"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_9256f2dd8687244df8254a8e571"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_fed98306025b521cb7b4d3617d7"`);
        await queryRunner.query(`DROP TABLE "timesheets"`);
        await queryRunner.query(`DROP TYPE "public"."timesheets_status_enum"`);
    }

}
