import { MigrationInterface, QueryRunner } from "typeorm";

export class ProjectFAT1764655180271 implements MigrationInterface {
    name = 'ProjectFAT1764655180271'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."projects_fat_enum" AS ENUM('ADAA', 'CLIENT')`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "fat" "public"."projects_fat_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "fat"`);
        await queryRunner.query(`DROP TYPE "public"."projects_fat_enum"`);
    }

}
