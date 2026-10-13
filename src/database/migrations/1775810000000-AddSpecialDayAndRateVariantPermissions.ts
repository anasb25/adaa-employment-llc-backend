import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpecialDayAndRateVariantPermissions1775810000000
  implements MigrationInterface
{
  name = 'AddSpecialDayAndRateVariantPermissions1775810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("name", "description") VALUES
        ('special-day:read', 'View special days'),
        ('special-day:create', 'Create special days'),
        ('special-day:update', 'Update special days'),
        ('special-day:delete', 'Delete special days'),
        ('special-day:all', 'All special day permissions'),
        ('rate-variant:read', 'View rate variants'),
        ('rate-variant:create', 'Create rate variants'),
        ('rate-variant:update', 'Update rate variants'),
        ('rate-variant:delete', 'Delete rate variants'),
        ('rate-variant:all', 'All rate variant permissions')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("roleId", "permissionId")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE LOWER(REPLACE(r.name, ' ', '')) = 'superadmin'
        AND p.name IN (
          'special-day:read', 'special-day:create', 'special-day:update',
          'special-day:delete', 'special-day:all',
          'rate-variant:read', 'rate-variant:create', 'rate-variant:update',
          'rate-variant:delete', 'rate-variant:all'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
        )
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("roleId", "permissionId")
      SELECT DISTINCT rp."roleId", p.id
      FROM role_permissions rp
      INNER JOIN permissions pu ON pu.id = rp."permissionId" AND pu.name = 'user:read'
      CROSS JOIN permissions p
      WHERE p.name IN ('special-day:read', 'rate-variant:read')
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions existing
          WHERE existing."roleId" = rp."roleId" AND existing."permissionId" = p.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permissionId" IN (
        SELECT id FROM "permissions"
        WHERE name LIKE 'special-day:%' OR name LIKE 'rate-variant:%'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "user_permissions"
      WHERE "permissionId" IN (
        SELECT id FROM "permissions"
        WHERE name LIKE 'special-day:%' OR name LIKE 'rate-variant:%'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE name LIKE 'special-day:%' OR name LIKE 'rate-variant:%'
    `);
  }
}
