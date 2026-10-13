import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPermissions1775700000000 implements MigrationInterface {
  name = 'AddUserPermissions1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_permissions" (
        "userId" integer NOT NULL,
        "permissionId" integer NOT NULL,
        CONSTRAINT "PK_user_permissions" PRIMARY KEY ("userId", "permissionId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_permissions_userId"
      ON "user_permissions" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_permissions_permissionId"
      ON "user_permissions" ("permissionId")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_permissions_user'
        ) THEN
          ALTER TABLE "user_permissions"
          ADD CONSTRAINT "FK_user_permissions_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_permissions_permission'
        ) THEN
          ALTER TABLE "user_permissions"
          ADD CONSTRAINT "FK_user_permissions_permission"
          FOREIGN KEY ("permissionId") REFERENCES "permissions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // Existing users start with their role's permissions. Later edits are per user.
    await queryRunner.query(`
      INSERT INTO "user_permissions" ("userId", "permissionId")
      SELECT u.id, rp."permissionId"
      FROM "users" u
      INNER JOIN "role_permissions" rp ON rp."roleId" = u."roleId"
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_permissions"`);
  }
}
