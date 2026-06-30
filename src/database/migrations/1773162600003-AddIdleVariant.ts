// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class AddIdleVariant1773162600003 implements MigrationInterface {
//   name = 'AddIdleVariant1773162600003';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     // Insert the "Idle" variant
//     await queryRunner.query(`
//       INSERT INTO "rate_variants" (
//         "name",
//         "description",
//         "displayOrder",
//         "isActive",
//         "color",
//         "employeeRateMultiplier",
//         "minHours",
//         "maxHours",
//         "isSystem",
//         "createdAt",
//         "updatedAt"
//       ) VALUES (
//         'Idle',
//         'Rate applied for idle hours (50% of base rate)',
//         1000,
//         true,
//         '#FFA500',
//         0.5,
//         NULL,
//         NULL,
//         true,
//         NOW(),
//         NOW()
//       )
//     `);
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     // Remove the "Idle" variant
//     await queryRunner.query(
//       `DELETE FROM "rate_variants" WHERE "name" = 'Idle' AND "isSystem" = true`,
//     );
//   }
// }
