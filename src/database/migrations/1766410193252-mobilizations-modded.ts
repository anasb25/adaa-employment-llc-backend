import { MigrationInterface, QueryRunner } from "typeorm";

export class MobilizationsModded1766410193252 implements MigrationInterface {
    name = 'MobilizationsModded1766410193252'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d85b2e657d344ed1d6f513fae4" ON "mobilizations" ("employeeId", "actionDate") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_d85b2e657d344ed1d6f513fae4"`);
    }

}
