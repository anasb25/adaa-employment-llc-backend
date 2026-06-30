// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class RemoveEmployeeStatusColumn1773162600005
//   implements MigrationInterface
// {
//   name = 'RemoveEmployeeStatusColumn1773162600005';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     // Drop the status column from employees table
//     await queryRunner.query(
//       `ALTER TABLE "employees" DROP COLUMN IF EXISTS "status"`,
//     );

//     // Drop the enum type
//     await queryRunner.query(
//       `DROP TYPE IF EXISTS "public"."employees_status_enum"`,
//     );
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     // Recreate the enum type
//     await queryRunner.query(
//       `CREATE TYPE "public"."employees_status_enum" AS ENUM('active', 'annual_leave')`,
//     );

//     // Add the status column back with default value
//     await queryRunner.query(
//       `ALTER TABLE "employees" ADD "status" "public"."employees_status_enum" NOT NULL DEFAULT 'active'`,
//     );
//   }
// }
