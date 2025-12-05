import { MigrationInterface, QueryRunner } from "typeorm";

export class TimesheetIdleEmployees1764752781700 implements MigrationInterface {
    name = 'TimesheetIdleEmployees1764752781700'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" ADD "employeeId" integer`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_fed98306025b521cb7b4d3617d7"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ALTER COLUMN "allocationId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_fed98306025b521cb7b4d3617d7" FOREIGN KEY ("allocationId") REFERENCES "project_allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_ff114055c64570460686de37c8e" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_ff114055c64570460686de37c8e"`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP CONSTRAINT "FK_fed98306025b521cb7b4d3617d7"`);
        await queryRunner.query(`ALTER TABLE "timesheets" ALTER COLUMN "allocationId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "timesheets" ADD CONSTRAINT "FK_fed98306025b521cb7b4d3617d7" FOREIGN KEY ("allocationId") REFERENCES "project_allocations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "employeeId"`);
    }

}
