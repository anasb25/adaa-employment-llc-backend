import { MigrationInterface, QueryRunner } from "typeorm";

export class Allocations1762975723874 implements MigrationInterface {
    name = 'Allocations1762975723874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project_allocations" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeId" integer NOT NULL, "projectId" integer NOT NULL, "startDate" date NOT NULL, "endDate" date, "notes" text, CONSTRAINT "PK_7a462ca39fe5d16b55005e95491" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "project_allocations" ADD CONSTRAINT "FK_ec3cb85f39d5c521b4607c01968" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_allocations" ADD CONSTRAINT "FK_224071f425ba2a2b486117b2e09" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_allocations" DROP CONSTRAINT "FK_224071f425ba2a2b486117b2e09"`);
        await queryRunner.query(`ALTER TABLE "project_allocations" DROP CONSTRAINT "FK_ec3cb85f39d5c521b4607c01968"`);
        await queryRunner.query(`DROP TABLE "project_allocations"`);
    }

}
