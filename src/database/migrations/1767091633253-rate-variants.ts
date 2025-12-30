import { MigrationInterface, QueryRunner } from "typeorm";

export class RateVariants1767091633253 implements MigrationInterface {
    name = 'RateVariants1767091633253'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project_rate_variant_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "projectId" integer NOT NULL, "rateVariantId" integer NOT NULL, "clientRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1', CONSTRAINT "UQ_44d8ebe8a277d4e4d0634f8c0bf" UNIQUE ("projectId", "rateVariantId"), CONSTRAINT "PK_14a8795cd84ba691bed6a9a2d5f" PRIMARY KEY ("id")); COMMENT ON COLUMN "project_rate_variant_rates"."clientRateMultiplier" IS 'Client rate multiplier for this rate variant on this project (e.g., 1.10 = 110%)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" ADD "employeeRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeRateMultiplier" IS 'Employee rate multiplier for this rate variant (e.g., 1.05 = 105% = 5% extra pay to employee)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" ADD "minHours" numeric(5,2)`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."minHours" IS 'Minimum hours for this rate variant to apply (null = no minimum, e.g., for ">10 hours" set minHours=10)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" ADD "maxHours" numeric(5,2)`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."maxHours" IS 'Maximum hours for this rate variant to apply (null = no maximum, e.g., for "<5 hours" set maxHours=5)'`);
        await queryRunner.query(`ALTER TABLE "project_rate_variant_rates" ADD CONSTRAINT "FK_d46d3c6a1a353aa629e06d898cc" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_rate_variant_rates" ADD CONSTRAINT "FK_ad7a93bb3b027f7d86abce04cb1" FOREIGN KEY ("rateVariantId") REFERENCES "rate_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_rate_variant_rates" DROP CONSTRAINT "FK_ad7a93bb3b027f7d86abce04cb1"`);
        await queryRunner.query(`ALTER TABLE "project_rate_variant_rates" DROP CONSTRAINT "FK_d46d3c6a1a353aa629e06d898cc"`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."maxHours" IS 'Maximum hours for this rate variant to apply (null = no maximum, e.g., for "<5 hours" set maxHours=5)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" DROP COLUMN "maxHours"`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."minHours" IS 'Minimum hours for this rate variant to apply (null = no minimum, e.g., for ">10 hours" set minHours=10)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" DROP COLUMN "minHours"`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeRateMultiplier" IS 'Employee rate multiplier for this rate variant (e.g., 1.05 = 105% = 5% extra pay to employee)'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" DROP COLUMN "employeeRateMultiplier"`);
        await queryRunner.query(`DROP TABLE "project_rate_variant_rates"`);
    }

}
