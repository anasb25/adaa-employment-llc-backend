import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollBreakdown1767097108408 implements MigrationInterface {
  name = 'AddPayrollBreakdown1767097108408';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add hoursBreakdown column to store detailed breakdown
    await queryRunner.query(
      `ALTER TABLE "payrolls" ADD "hoursBreakdown" jsonb`,
    );

    // Add baseHourlyRate column
    await queryRunner.query(
      `ALTER TABLE "payrolls" ADD "baseHourlyRate" numeric(10,2) NOT NULL DEFAULT '0'`,
    );

    // Add totalGrossSalary column
    await queryRunner.query(
      `ALTER TABLE "payrolls" ADD "totalGrossSalary" numeric(10,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns in reverse order
    await queryRunner.query(
      `ALTER TABLE "payrolls" DROP COLUMN "totalGrossSalary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payrolls" DROP COLUMN "baseHourlyRate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payrolls" DROP COLUMN "hoursBreakdown"`,
    );
  }
}
