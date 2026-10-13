import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ensure the super admin role has every permission in the catalog. */
export class SuperAdminAllPermissions1775800000000 implements MigrationInterface {
  name = 'SuperAdminAllPermissions1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("roleId", "permissionId")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE LOWER(REPLACE(r.name, ' ', '')) = 'superadmin'
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp
          WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
        )
    `);

    await queryRunner.query(`
      INSERT INTO "user_permissions" ("userId", "permissionId")
      SELECT u.id, p.id
      FROM "users" u
      INNER JOIN "roles" r ON r.id = u."roleId"
      CROSS JOIN "permissions" p
      WHERE LOWER(REPLACE(r.name, ' ', '')) = 'superadmin'
        AND NOT EXISTS (
          SELECT 1 FROM "user_permissions" up
          WHERE up."userId" = u.id AND up."permissionId" = p.id
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op: do not strip super admin permissions on rollback.
  }
}
