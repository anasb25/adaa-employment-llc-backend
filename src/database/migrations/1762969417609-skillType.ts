import { MigrationInterface, QueryRunner } from "typeorm";

export class SkillType1762969417609 implements MigrationInterface {
    name = 'SkillType1762969417609'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "skills" RENAME COLUMN "type" TO "skillTypeId"`);
        await queryRunner.query(`CREATE TABLE "skill_types" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "type" character varying NOT NULL, CONSTRAINT "UQ_5e243eff60d1557bf02befe5661" UNIQUE ("type"), CONSTRAINT "PK_f98a760e950fc2f7376178e0689" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "skillTypeId"`);
        await queryRunner.query(`ALTER TABLE "skills" ADD "skillTypeId" integer`);
        await queryRunner.query(`ALTER TABLE "skills" ADD CONSTRAINT "FK_7bf6478b367e3d3d9f505299a5e" FOREIGN KEY ("skillTypeId") REFERENCES "skill_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "skills" DROP CONSTRAINT "FK_7bf6478b367e3d3d9f505299a5e"`);
        await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "skillTypeId"`);
        await queryRunner.query(`ALTER TABLE "skills" ADD "skillTypeId" character varying NOT NULL`);
        await queryRunner.query(`DROP TABLE "skill_types"`);
        await queryRunner.query(`ALTER TABLE "skills" RENAME COLUMN "skillTypeId" TO "type"`);
    }

}
