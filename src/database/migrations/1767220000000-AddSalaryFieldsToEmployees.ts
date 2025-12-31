import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalaryFieldsToEmployees1767220000000
  implements MigrationInterface
{
  name = 'AddSalaryFieldsToEmployees1767220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "basic_salary" numeric(10,2) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "hra" numeric(10,2) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "other_allowance" numeric(10,2) DEFAULT NULL`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."basic_salary" IS 'Employee basic salary'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."hra" IS 'House Rent Allowance'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."other_allowance" IS 'Other allowances'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "other_allowance"`,
    );
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "hra"`);
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN "basic_salary"`,
    );
  }
}
