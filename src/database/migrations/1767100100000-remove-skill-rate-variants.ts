import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSkillRateVariants1767100100000
  implements MigrationInterface
{
  name = 'RemoveSkillRateVariants1767100100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop skill rate tables
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_skill_rates" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."employee_skill_rates_ratetype_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_rates" CASCADE`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."skill_rates_ratetype_enum"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "project_skill_rates" CASCADE`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."project_skill_rates_ratetype_enum"`,
    );

    // Remove isBaseRate column from rate_variants
    await queryRunner.query(
      `ALTER TABLE "rate_variants" DROP COLUMN IF EXISTS "isBaseRate"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back isBaseRate column
    await queryRunner.query(
      `ALTER TABLE "rate_variants" ADD "isBaseRate" boolean NOT NULL DEFAULT false`,
    );

    // Recreate skill_rates table
    await queryRunner.query(
      `CREATE TYPE "public"."skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`,
    );
    await queryRunner.query(
      `CREATE TABLE "skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "skillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "employeeRateValue" numeric(10,2) NOT NULL, "clientRateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_b25b762de1a2dadf89a77e01d85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_450bdde770b40cecbd20241f69" ON "skill_rates" ("skillId", "rateVariantId")`,
    );

    // Recreate employee_skill_rates table
    await queryRunner.query(
      `CREATE TYPE "public"."employee_skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeSkillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."employee_skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "rateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_b3a2961dd7db314da24115f62f7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_48644d7860298eaade2e57364a" ON "employee_skill_rates" ("employeeSkillId", "rateVariantId")`,
    );

    // Recreate project_skill_rates table (from earlier migration)
    await queryRunner.query(
      `CREATE TYPE "public"."project_skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`,
    );
    await queryRunner.query(
      `CREATE TABLE "project_skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "projectId" integer NOT NULL, "skillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."project_skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "rateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_cd247d3d68faf1b46a5a13b22fb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_becff0183222cd251144e23e8e" ON "project_skill_rates" ("projectId", "skillId", "rateVariantId")`,
    );
  }
}
