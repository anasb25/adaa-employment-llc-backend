import { MigrationInterface, QueryRunner } from "typeorm";

export class LastMonthSalaryPaid1769562633718 implements MigrationInterface {
    name = 'LastMonthSalaryPaid1769562633718'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" ADD "lastMonthSalaryPaid" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settlements" DROP COLUMN "lastMonthSalaryPaid"`);
    }

}
