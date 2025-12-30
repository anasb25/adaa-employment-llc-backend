import { MigrationInterface, QueryRunner } from "typeorm";

export class SpecialDaysMod1766656898553 implements MigrationInterface {
    name = 'SpecialDaysMod1766656898553'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`);
        await queryRunner.query(`CREATE TABLE "skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "skillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "employeeRateValue" numeric(10,2) NOT NULL, "clientRateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_b25b762de1a2dadf89a77e01d85" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_450bdde770b40cecbd20241f69" ON "skill_rates" ("skillId", "rateVariantId") `);
        await queryRunner.query(`CREATE TYPE "public"."employee_skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`);
        await queryRunner.query(`CREATE TABLE "employee_skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeSkillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."employee_skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "rateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_b3a2961dd7db314da24115f62f7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_48644d7860298eaade2e57364a" ON "employee_skill_rates" ("employeeSkillId", "rateVariantId") `);
        await queryRunner.query(`ALTER TABLE "skill_rates" ADD CONSTRAINT "FK_72b2c921c33cb4578f0ea4d23ea" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "skill_rates" ADD CONSTRAINT "FK_6416fab1626cb5ebe7547d3b517" FOREIGN KEY ("rateVariantId") REFERENCES "rate_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_skill_rates" ADD CONSTRAINT "FK_134432961a7970ac70ea746510f" FOREIGN KEY ("employeeSkillId") REFERENCES "employee_skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_skill_rates" ADD CONSTRAINT "FK_56997396294ca7e8c0b32f66281" FOREIGN KEY ("rateVariantId") REFERENCES "rate_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_skill_rates" DROP CONSTRAINT "FK_56997396294ca7e8c0b32f66281"`);
        await queryRunner.query(`ALTER TABLE "employee_skill_rates" DROP CONSTRAINT "FK_134432961a7970ac70ea746510f"`);
        await queryRunner.query(`ALTER TABLE "skill_rates" DROP CONSTRAINT "FK_6416fab1626cb5ebe7547d3b517"`);
        await queryRunner.query(`ALTER TABLE "skill_rates" DROP CONSTRAINT "FK_72b2c921c33cb4578f0ea4d23ea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_48644d7860298eaade2e57364a"`);
        await queryRunner.query(`DROP TABLE "employee_skill_rates"`);
        await queryRunner.query(`DROP TYPE "public"."employee_skill_rates_ratetype_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_450bdde770b40cecbd20241f69"`);
        await queryRunner.query(`DROP TABLE "skill_rates"`);
        await queryRunner.query(`DROP TYPE "public"."skill_rates_ratetype_enum"`);
    }

}
