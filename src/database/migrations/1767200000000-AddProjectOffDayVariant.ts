import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectOffDayVariant1767200000000
  implements MigrationInterface
{
  name = 'AddProjectOffDayVariant1767200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add isSystem column to rate_variants table
    await queryRunner.query(
      `ALTER TABLE "rate_variants" ADD "isSystem" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "rate_variants"."isSystem" IS 'System-defined variant that cannot be deleted or edited (except multiplier)'`,
    );

    // Insert the "Project Off Day" variant
    await queryRunner.query(`
      INSERT INTO "rate_variants" (
        "name",
        "description",
        "displayOrder",
        "isActive",
        "color",
        "employeeRateMultiplier",
        "minHours",
        "maxHours",
        "isSystem",
        "createdAt",
        "updatedAt"
      ) VALUES (
        'Project Off Day',
        'Rate applied for hours worked on project off days',
        999,
        true,
        '#FF6B6B',
        1.0,
        NULL,
        NULL,
        true,
        NOW(),
        NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the "Project Off Day" variant
    await queryRunner.query(
      `DELETE FROM "rate_variants" WHERE "name" = 'Project Off Day' AND "isSystem" = true`,
    );

    // Remove isSystem column
    await queryRunner.query(
      `ALTER TABLE "rate_variants" DROP COLUMN IF EXISTS "isSystem"`,
    );
  }
}

