import { MigrationInterface, QueryRunner } from "typeorm";

export class Settlements1769164977549 implements MigrationInterface {
    name = 'Settlements1769164977549'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."settlements_contracttype_enum" AS ENUM('LIMITED', 'UNLIMITED')`);
        await queryRunner.query(`CREATE TYPE "public"."settlements_status_enum" AS ENUM('draft', 'pending_approval', 'approved', 'paid', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "settlements" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeId" integer NOT NULL, "empCode" character varying NOT NULL, "empName" character varying NOT NULL, "jobTitle" character varying, "dateOfJoin" date, "lastDateOfWork" date, "lastTotalSalary" numeric(10,2), "totalDaysAbsent" integer NOT NULL DEFAULT '0', "eligibleForGratuity" boolean NOT NULL DEFAULT false, "gratuityDaysPerYear" integer DEFAULT '21', "gratuityReason" text, "hourlySalary" numeric(10,2), "hourlyRate" numeric(10,2), "allowance" numeric(10,2), "transportAllowance" numeric(10,2), "otherAllowances" numeric(10,2), "totalYearsOfService" numeric(5,2), "annualLeaveBalance" numeric(5,2), "contractType" "public"."settlements_contracttype_enum", "paymentItems" jsonb NOT NULL DEFAULT '[]', "deductionItems" jsonb NOT NULL DEFAULT '[]', "totalDue" numeric(10,2) NOT NULL DEFAULT '0', "totalDeduction" numeric(10,2) NOT NULL DEFAULT '0', "finalAmount" numeric(10,2) NOT NULL DEFAULT '0', "passportNo" character varying, "status" "public"."settlements_status_enum" NOT NULL DEFAULT 'draft', "preparedBy" integer, "checkedBy" integer, "approvedBy" integer, "approvedAt" TIMESTAMP, "paidAt" TIMESTAMP, CONSTRAINT "PK_5f523ce152b84e818bff9467aab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_70125127cf121db8d11b6f3c1ea" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_70125127cf121db8d11b6f3c1ea"`);
        await queryRunner.query(`DROP TABLE "settlements"`);
        await queryRunner.query(`DROP TYPE "public"."settlements_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."settlements_contracttype_enum"`);
    }

}
