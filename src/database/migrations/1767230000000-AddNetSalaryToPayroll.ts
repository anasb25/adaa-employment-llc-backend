import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNetSalaryToPayroll1767230000000
  implements MigrationInterface
{
  name = 'AddNetSalaryToPayroll1767230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payrolls" ADD "netSalary" numeric(10,2) DEFAULT NULL`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "payrolls"."netSalary" IS 'Net salary after all additions and deductions'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payrolls" DROP COLUMN "netSalary"`);
  }
}

