import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveArrearsColumn1767210000000 implements MigrationInterface {
  name = 'RemoveArrearsColumn1767210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove arrears column from payrolls table
    await queryRunner.query(
      `ALTER TABLE "payrolls" DROP COLUMN IF EXISTS "arrears"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back arrears column
    await queryRunner.query(`ALTER TABLE "payrolls" ADD "arrears" jsonb`);
  }
}
