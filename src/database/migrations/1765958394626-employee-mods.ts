import { MigrationInterface, QueryRunner } from "typeorm";

export class EmployeeMods1765958394626 implements MigrationInterface {
    name = 'EmployeeMods1765958394626'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_3556c7e8c0978a5a3bfe81567ea" UNIQUE ("pp_no")`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_a8de3ddfd53ca6daf6ba8dd6b93" UNIQUE ("emirates_id")`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_881baf54c44c87b063cbe13be95" UNIQUE ("work_permit_no")`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "UQ_e6d0477fa3b9da44fb03ad28fa5" UNIQUE ("personal_code")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_e6d0477fa3b9da44fb03ad28fa5"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_881baf54c44c87b063cbe13be95"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_a8de3ddfd53ca6daf6ba8dd6b93"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "UQ_3556c7e8c0978a5a3bfe81567ea"`);
    }

}
