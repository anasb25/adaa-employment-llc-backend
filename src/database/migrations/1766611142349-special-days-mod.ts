import { MigrationInterface, QueryRunner } from "typeorm";

export class SpecialDaysMod1766611142349 implements MigrationInterface {
    name = 'SpecialDaysMod1766611142349'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."special_days_daytype_enum" AS ENUM('mandatory_off', 'optional_off', 'premium_rate', 'regular')`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "dayType" "public"."special_days_daytype_enum" NOT NULL DEFAULT 'regular'`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "clientRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "employeeRateMultiplier" numeric(5,2) NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "isDefaultOff" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "special_days" ADD "notes" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "notes"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "isDefaultOff"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "employeeRateMultiplier"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "clientRateMultiplier"`);
        await queryRunner.query(`ALTER TABLE "special_days" DROP COLUMN "dayType"`);
        await queryRunner.query(`DROP TYPE "public"."special_days_daytype_enum"`);
    }

}
