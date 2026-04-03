import { MigrationInterface, QueryRunner } from "typeorm";

export class Changes1775177588800 implements MigrationInterface {
    name = 'Changes1775177588800'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "special_days" ADD "minBillingHours" numeric(5,2)`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "billingHoursThreshold" numeric(5,2)`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "additionalHoursAboveThreshold" numeric(5,2)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "additionalHoursAboveThreshold"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "billingHoursThreshold"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "minBillingHours"`);
    }

}
