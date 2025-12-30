import { MigrationInterface, QueryRunner } from "typeorm";

export class Payroll1767069707555 implements MigrationInterface {
    name = 'Payroll1767069707555'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "payrolls" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeId" integer NOT NULL, "month" character varying(7) NOT NULL, "totalHours" numeric(10,2) NOT NULL DEFAULT '0', "totalOtHours" numeric(10,2) NOT NULL DEFAULT '0', "totalOffdaysWorkedHours" numeric(10,2) NOT NULL DEFAULT '0', "totalIdleDayHours" numeric(10,2) NOT NULL DEFAULT '0', "allowances" jsonb, "arrears" jsonb, "absentDaysDeductible" numeric(10,2) NOT NULL DEFAULT '0', "otherDeductions" jsonb, "notes" text, CONSTRAINT "PK_4fc19dcf3522661435565b5ecf3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2aa810f9452f690411091ce20c" ON "payrolls" ("employeeId", "month") `);
        await queryRunner.query(`ALTER TABLE "payrolls" ADD CONSTRAINT "FK_eeffbd86fba74517d4dacc8ab37" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payrolls" DROP CONSTRAINT "FK_eeffbd86fba74517d4dacc8ab37"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2aa810f9452f690411091ce20c"`);
        await queryRunner.query(`DROP TABLE "payrolls"`);
    }

}
