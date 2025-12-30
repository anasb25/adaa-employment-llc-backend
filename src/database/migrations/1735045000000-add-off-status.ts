// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class AddOffStatus1735045000000 implements MigrationInterface {
//   name = 'AddOffStatus1735045000000';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     // Add 'off' to the job_status enum
//     await queryRunner.query(`
//             ALTER TYPE "public"."mobilizations_jobstatus_enum"
//             ADD VALUE IF NOT EXISTS 'off'
//         `);
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     // Note: PostgreSQL doesn't support removing enum values directly
//     // If you need to remove this, you'll need to recreate the entire enum
//     console.log(
//       'Cannot remove enum value in PostgreSQL - manual intervention required if needed',
//     );
//   }
// }
