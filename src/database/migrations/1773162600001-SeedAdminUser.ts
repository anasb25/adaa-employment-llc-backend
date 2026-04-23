// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class SeedAdminUser1773162600001 implements MigrationInterface {
//   name = 'SeedAdminUser1773162600001';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     // Get the admin role ID
//     const adminRole = await queryRunner.query(
//       `SELECT id FROM "roles" WHERE name = 'admin' LIMIT 1`,
//     );

//     if (adminRole.length === 0) {
//       throw new Error(
//         'Admin role not found. Please ensure roles are seeded first.',
//       );
//     }

//     const adminRoleId = adminRole[0].id;

//     // Insert the admin user
//     await queryRunner.query(
//       `
//             INSERT INTO "users" ("email", "firstName", "lastName", "password", "roleId", "isActive", "createdAt", "updatedAt")
//             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
//         `,
//       [
//         'example@example.com',
//         'Admin',
//         'User',
//         '$2b$10$/TRALjvMxRa1fc7Vic3P8uv3dwd7Cxs97hw3y2.93SDpicn.brRhu', // Admin@123 hashed
//         adminRoleId,
//         true,
//       ],
//     );
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     // Remove the seeded admin user
//     await queryRunner.query(
//       `DELETE FROM "users" WHERE email = 'example@example.com'`,
//     );
//   }
// }
