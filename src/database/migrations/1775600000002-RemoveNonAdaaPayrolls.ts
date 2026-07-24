import { MigrationInterface, QueryRunner } from 'typeorm';

const ADAA_SUPPLIER = 'ADAA';

export class RemoveNonAdaaPayrolls1775600000002 implements MigrationInterface {
  name = 'RemoveNonAdaaPayrolls1775600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM "payrolls" p
      USING "employees" e
      LEFT JOIN "suppliers" s ON s.id = e."supplierId"
      WHERE p."employeeId" = e.id
        AND (s.name IS NULL OR s.name != $1)
    `,
      [ADAA_SUPPLIER],
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Removed payroll rows cannot be restored automatically.
  }
}
