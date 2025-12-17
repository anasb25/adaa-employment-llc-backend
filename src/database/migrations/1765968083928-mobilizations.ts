import { MigrationInterface, QueryRunner } from 'typeorm';

export class Mobilizations1765968083928 implements MigrationInterface {
  name = 'Mobilizations1765968083928';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."mobilizations_status_enum" AS ENUM('active', 'inactive')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mobilizations_mobstatus_enum" AS ENUM('mobilized', 'demobilized')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mobilizations_jobstatus_enum" AS ENUM('on_job', 'cancelled', 'on_vacation', 'absconded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "mobilizations" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeId" integer NOT NULL, "mobilizedTradeId" integer NOT NULL, "projectId" integer, "status" "public"."mobilizations_status_enum" NOT NULL DEFAULT 'active', "mobStatus" "public"."mobilizations_mobstatus_enum" NOT NULL DEFAULT 'demobilized', "jobStatus" "public"."mobilizations_jobstatus_enum" NOT NULL DEFAULT 'on_job', "actionDate" date NOT NULL, "notes" text, CONSTRAINT "PK_c3653bb14f9eec1581b1069d683" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "status"`);
    await queryRunner.query(
      `ALTER TABLE "mobilizations" ADD CONSTRAINT "FK_95fe3a1698afb31e6402487f6fe" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mobilizations" ADD CONSTRAINT "FK_1fd9adba03688cb4352a7b9f3e4" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mobilizations" ADD CONSTRAINT "FK_0894477e88ab2e48a18a9df92a2" FOREIGN KEY ("mobilizedTradeId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mobilizations" DROP CONSTRAINT "FK_0894477e88ab2e48a18a9df92a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mobilizations" DROP CONSTRAINT "FK_1fd9adba03688cb4352a7b9f3e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mobilizations" DROP CONSTRAINT "FK_95fe3a1698afb31e6402487f6fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD "status" character varying NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE "mobilizations"`);
    await queryRunner.query(
      `DROP TYPE "public"."mobilizations_jobstatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."mobilizations_mobstatus_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."mobilizations_status_enum"`);
  }
}
