import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRolesAndPermissions1761279000364 implements MigrationInterface {
  name = 'AddRolesAndPermissions1761279000364';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert default permissions
    await queryRunner.query(`INSERT INTO "permissions" ("name", "description") VALUES 
            ('user:create', 'Create new users'),
            ('user:read', 'View user information'),
            ('user:update', 'Update user information'),
            ('user:delete', 'Delete users'),
            ('user:assign-roles', 'Assign roles to users'),
            ('user:all', 'All user permissions'),
            ('role:create', 'Create new roles'),
            ('role:read', 'View role information'),
            ('role:update', 'Update role information'),
            ('role:delete', 'Delete roles'),
            ('role:assign-permissions', 'Assign permissions to roles'),
            ('role:all', 'All role permissions'),
            ('permission:create', 'Create new permissions'),
            ('permission:read', 'View permission information'),
            ('permission:update', 'Update permission information'),
            ('permission:delete', 'Delete permissions'),
            ('permission:all', 'All permission permissions'),
            ('global:all', 'All permissions across all resources')
        `);

    // Insert default roles
    await queryRunner.query(`INSERT INTO "roles" ("name", "description") VALUES 
            ('admin', 'Administrator with full access'),
            ('manager', 'Manager with limited administrative access'),
            ('user', 'Regular user with basic access')
        `);

    // Assign permissions to roles
    // Admin gets global:all permission (covers everything)
    await queryRunner.query(`INSERT INTO "role_permissions" ("roleId", "permissionId") 
            SELECT r.id, p.id FROM "roles" r, "permissions" p 
            WHERE r.name = 'admin' AND p.name = 'global:all'`);

    // Manager gets user:all permission
    await queryRunner.query(`INSERT INTO "role_permissions" ("roleId", "permissionId") 
            SELECT r.id, p.id FROM "roles" r, "permissions" p 
            WHERE r.name = 'manager' AND p.name = 'user:all'`);

    // User gets basic read permissions
    await queryRunner.query(`INSERT INTO "role_permissions" ("roleId", "permissionId") 
            SELECT r.id, p.id FROM "roles" r, "permissions" p 
            WHERE r.name = 'user' AND p.name = 'user:read'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_invitations_roleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_roleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_roleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permissions_permissionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_role_permissions_roleId"`,
    );

    // Drop junction tables
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);

    // Drop main tables
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "permissions"`);

    // Add back old columns to users table
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "permissions" text`);

    // Drop roleId column from users table
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleId"`);

    // Add back old columns to invitations table
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD "role" character varying NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(`ALTER TABLE "invitations" ADD "permissions" text`);

    // Drop roleId column from invitations table
    await queryRunner.query(`ALTER TABLE "invitations" DROP COLUMN "roleId"`);
  }
}
