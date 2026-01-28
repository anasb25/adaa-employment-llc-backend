import { MigrationInterface, QueryRunner } from "typeorm";

export class Aaa1768163244744 implements MigrationInterface {
    name = 'Aaa1768163244744'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "special_days" ADD COLUMN IF NOT EXISTS "clientRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "special_days"."clientRateMultiplier" IS 'Global client rate multiplier for this special day (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" ADD COLUMN IF NOT EXISTS "clientRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."clientRateMultiplier" IS 'Global client rate multiplier for this rate variant (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.'`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "basic_salary" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "hra" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "other_allowance" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "payrolls" ALTER COLUMN "netSalary" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payrolls" ALTER COLUMN "netSalary" SET DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "other_allowance" SET DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "hra" SET DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "employees" ALTER COLUMN "basic_salary" SET DEFAULT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."clientRateMultiplier" IS 'Global client rate multiplier for this rate variant (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.'`);
        await queryRunner.query(`ALTER TABLE "rate_variants" DROP COLUMN "clientRateMultiplier"`);
        await queryRunner.query(`COMMENT ON COLUMN "special_days"."clientRateMultiplier" IS 'Global client rate multiplier for this special day (e.g., 1.10 = 110%). Used when project-specific multiplier is not set.'`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "clientRateMultiplier"`);
    }

}
