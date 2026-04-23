// import { MigrationInterface, QueryRunner } from "typeorm";

// export class Changes1775174416219 implements MigrationInterface {
//     name = 'Changes1775174416219'

//     public async up(queryRunner: QueryRunner): Promise<void> {
//         await queryRunner.query(`DROP INDEX "public"."IDX_timesheets_month_idle"`);
//         await queryRunner.query(`DROP INDEX "public"."IDX_timesheets_project_month"`);
//         await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "cost_price"`);
//         await queryRunner.query(`ALTER TABLE "special_days" ADD "employeeAdditionalAmount" numeric(10,2) NOT NULL DEFAULT '0'`);
//         await queryRunner.query(`COMMENT ON COLUMN "special_days"."employeeAdditionalAmount" IS 'Flat additional AED/hr added to employee base rate for this special day'`);
//         await queryRunner.query(`ALTER TABLE "rate_variants" ADD "employeeAdditionalAmount" numeric(10,2) NOT NULL DEFAULT '0'`);
//         await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeAdditionalAmount" IS 'Flat additional AED/hr added to employee base rate for this variant (e.g., 2 = base + 2 AED/hr)'`);
//         await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeRateMultiplier" IS 'Legacy multiplier field — no longer used for cost calculations'`);
//     }

//     public async down(queryRunner: QueryRunner): Promise<void> {
//         await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeRateMultiplier" IS 'Employee rate multiplier for this rate variant (e.g., 1.05 = 105% = 5% extra pay to employee)'`);
//         await queryRunner.query(`COMMENT ON COLUMN "rate_variants"."employeeAdditionalAmount" IS 'Flat additional AED/hr added to employee base rate for this variant (e.g., 2 = base + 2 AED/hr)'`);
//         await queryRunner.query(`ALTER TABLE "rate_variants" DROP COLUMN "employeeAdditionalAmount"`);
//         await queryRunner.query(`COMMENT ON COLUMN "special_days"."employeeAdditionalAmount" IS 'Flat additional AED/hr added to employee base rate for this special day'`);
//         await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "employeeAdditionalAmount"`);
//         await queryRunner.query(`ALTER TABLE "skills" ADD "cost_price" numeric(10,2)`);
//         await queryRunner.query(`CREATE UNIQUE INDEX "IDX_timesheets_project_month" ON "timesheets" ("month", "projectId") WHERE ("projectId" IS NOT NULL)`);
//         await queryRunner.query(`CREATE UNIQUE INDEX "IDX_timesheets_month_idle" ON "timesheets" ("month") WHERE ("projectId" IS NULL)`);
//     }

// }
