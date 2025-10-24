import { MigrationInterface, QueryRunner } from "typeorm";

export class LastActivityForUser1761335211472 implements MigrationInterface {
    name = 'LastActivityForUser1761335211472'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "lastActivity" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastActivity"`);
    }

}
