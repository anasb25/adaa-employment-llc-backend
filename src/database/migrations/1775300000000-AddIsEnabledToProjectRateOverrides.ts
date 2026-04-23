import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an `isEnabled` flag to project-level override tables for special days
 * and rate variants. When `isEnabled = false`, the corresponding special day
 * (or rate variant) is treated as NOT APPLICABLE for that project:
 *   - mandatory / optional-off rules do not force the day to OFF
 *   - employee additional amount is not added
 *   - billing-hours rules are skipped
 *   - client rate multiplier is not applied
 *
 * Existing rows default to `true` so behavior is preserved.
 */
export class AddIsEnabledToProjectRateOverrides1775300000000
  implements MigrationInterface
{
  name = 'AddIsEnabledToProjectRateOverrides1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_special_day_rates" ADD "isEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "project_special_day_rates"."isEnabled" IS 'When false, the special day does not apply to this project at all (overrides global rules, multipliers, and billing-hours behaviour).'`,
    );

    await queryRunner.query(
      `ALTER TABLE "project_rate_variant_rates" ADD "isEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "project_rate_variant_rates"."isEnabled" IS 'When false, the rate variant is not applied to this project (the variant is skipped during invoice and payroll calculations).'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_rate_variant_rates" DROP COLUMN "isEnabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_special_day_rates" DROP COLUMN "isEnabled"`,
    );
  }
}
