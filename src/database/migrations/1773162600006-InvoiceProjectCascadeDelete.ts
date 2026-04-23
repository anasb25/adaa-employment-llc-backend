// import { MigrationInterface, QueryRunner } from 'typeorm';

// /**
//  * When a project is deleted, cascade to invoices (and other project-dependent
//  * tables already have CASCADE). Employees and client are not affected.
//  */
// export class InvoiceProjectCascadeDelete1773162600006
//   implements MigrationInterface
// {
//   name = 'InvoiceProjectCascadeDelete1773162600006';

//   public async up(queryRunner: QueryRunner): Promise<void> {
//     await queryRunner.query(
//       `ALTER TABLE "invoices" DROP CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d"`,
//     );
//     await queryRunner.query(
//       `ALTER TABLE "invoices" ADD CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
//     );
//   }

//   public async down(queryRunner: QueryRunner): Promise<void> {
//     await queryRunner.query(
//       `ALTER TABLE "invoices" DROP CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d"`,
//     );
//     await queryRunner.query(
//       `ALTER TABLE "invoices" ADD CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
//     );
//   }
// }
