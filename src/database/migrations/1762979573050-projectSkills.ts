import { MigrationInterface, QueryRunner } from "typeorm";

export class ProjectSkills1762979573050 implements MigrationInterface {
    name = 'ProjectSkills1762979573050'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project_skills" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "projectId" integer NOT NULL, "skillId" integer NOT NULL, "sale_price" numeric(10,2), CONSTRAINT "UQ_191b202fe8fdcacf4b353fe2aef" UNIQUE ("projectId", "skillId"), CONSTRAINT "PK_76a7f6ff4b84e9a580e24d09cc6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "employee_skills" ADD "cost_price" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "skills" ADD "cost_price" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "skills" ADD "sale_price" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "project_skills" ADD CONSTRAINT "FK_8cbc0f1e52a4bfaf783108f99c4" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_skills" ADD CONSTRAINT "FK_a60e9e349e2e6cbe2cf73b1fbda" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_skills" DROP CONSTRAINT "FK_a60e9e349e2e6cbe2cf73b1fbda"`);
        await queryRunner.query(`ALTER TABLE "project_skills" DROP CONSTRAINT "FK_8cbc0f1e52a4bfaf783108f99c4"`);
        await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "sale_price"`);
        await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "cost_price"`);
        await queryRunner.query(`ALTER TABLE "employee_skills" DROP COLUMN "cost_price"`);
        await queryRunner.query(`DROP TABLE "project_skills"`);
    }

}
