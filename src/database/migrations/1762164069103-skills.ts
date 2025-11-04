import { MigrationInterface, QueryRunner } from "typeorm";

export class Skills1762164069103 implements MigrationInterface {
    name = 'Skills1762164069103'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "employee_skills" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "employeeId" integer NOT NULL, "skillId" integer NOT NULL, "rating" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_e8434ffe19a0877d1bbe481c8d6" UNIQUE ("employeeId", "skillId"), CONSTRAINT "PK_e74b1e2cad6e8aba5368ff116a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "skills" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "type" character varying NOT NULL, "skill" character varying NOT NULL, CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "employee_skills" ADD CONSTRAINT "FK_d204ae165a459ee941d7a4cf44c" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_skills" ADD CONSTRAINT "FK_06e907dd0268f51dfae0308baab" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employee_skills" DROP CONSTRAINT "FK_06e907dd0268f51dfae0308baab"`);
        await queryRunner.query(`ALTER TABLE "employee_skills" DROP CONSTRAINT "FK_d204ae165a459ee941d7a4cf44c"`);
        await queryRunner.query(`DROP TABLE "skills"`);
        await queryRunner.query(`DROP TABLE "employee_skills"`);
    }

}
