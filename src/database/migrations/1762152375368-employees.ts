import { MigrationInterface, QueryRunner } from "typeorm";

export class Employees1762152375368 implements MigrationInterface {
    name = 'Employees1762152375368'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum" AS ENUM('active', 'on_vacation')`);
        await queryRunner.query(`CREATE TABLE "employees" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "adaa_emp_code" character varying NOT NULL, "name" character varying NOT NULL, "dob" date, "pp_no" character varying, "pp_expiry" date, "nationality" character varying, "emirates_id" character varying, "emirates_id_expiry" date, "visa_expiry" date, "work_permit_no" character varying, "work_permit_expiry" date, "personal_code" character varying, "contact_no" character varying, "status" "public"."employees_status_enum" NOT NULL DEFAULT 'active', "date_of_joining" date, "date_of_arrival" date, CONSTRAINT "UQ_57cc6da9f1ece3295cff4d31d0b" UNIQUE ("adaa_emp_code"), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum"`);
    }

}
