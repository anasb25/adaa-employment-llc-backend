import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedProjectOffDayVariant1773162600002 implements MigrationInterface {
  name = 'SeedProjectOffDayVariant1773162600002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert the "Project Off Day" variant (isSystem column comes from schema migration)
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
    await queryRunner.query(
      `DELETE FROM "rate_variants" WHERE "name" = 'Project Off Day' AND "isSystem" = true`,
    );
  }
}
