import { MigrationInterface, QueryRunner } from "typeorm";

export class TimesheetsModded11766498457468 implements MigrationInterface {
    name = 'TimesheetsModded11766498457468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" RENAME COLUMN "status" TO "offDays"`);
        await queryRunner.query(`ALTER TYPE "public"."projects_status_enum" RENAME TO "projects_offdays_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."clients_paymentterms_enum" AS ENUM('15', '30', '45', '60')`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "paymentTerms" "public"."clients_paymentterms_enum"`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "trn" character varying`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "offDays"`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "offDays" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "offDays"`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "offDays" "public"."projects_offdays_enum" NOT NULL DEFAULT 'planned'`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "trn"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "paymentTerms"`);
        await queryRunner.query(`DROP TYPE "public"."clients_paymentterms_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."projects_offdays_enum" RENAME TO "projects_status_enum"`);
        await queryRunner.query(`ALTER TABLE "projects" RENAME COLUMN "offDays" TO "status"`);
    }

}
