import { MigrationInterface, QueryRunner } from "typeorm";

export class RateVariants1766640507964 implements MigrationInterface {
    name = 'RateVariants1766640507964'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "rate_variants" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "name" character varying NOT NULL, "description" character varying, "isBaseRate" boolean NOT NULL DEFAULT false, "displayOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "color" character varying, CONSTRAINT "UQ_c03c6ab9287486f8e585d7e8770" UNIQUE ("name"), CONSTRAINT "PK_089468212ed965f73d73bc5a6b7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."project_skill_rates_ratetype_enum" AS ENUM('flat', 'multiplier')`);
        await queryRunner.query(`CREATE TABLE "project_skill_rates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "projectId" integer NOT NULL, "skillId" integer NOT NULL, "rateVariantId" integer NOT NULL, "rateType" "public"."project_skill_rates_ratetype_enum" NOT NULL DEFAULT 'flat', "rateValue" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_cd247d3d68faf1b46a5a13b22fb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_becff0183222cd251144e23e8e" ON "project_skill_rates" ("projectId", "skillId", "rateVariantId") `);
        await queryRunner.query(`ALTER TABLE "project_skill_rates" ADD CONSTRAINT "FK_7378583b45ee31d0ede8af4725a" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_skill_rates" ADD CONSTRAINT "FK_798483c9fd9f7f1a1c960f8b791" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_skill_rates" ADD CONSTRAINT "FK_69539287089cd9a8b8f6d0c3afa" FOREIGN KEY ("rateVariantId") REFERENCES "rate_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_skill_rates" DROP CONSTRAINT "FK_69539287089cd9a8b8f6d0c3afa"`);
        await queryRunner.query(`ALTER TABLE "project_skill_rates" DROP CONSTRAINT "FK_798483c9fd9f7f1a1c960f8b791"`);
        await queryRunner.query(`ALTER TABLE "project_skill_rates" DROP CONSTRAINT "FK_7378583b45ee31d0ede8af4725a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_becff0183222cd251144e23e8e"`);
        await queryRunner.query(`DROP TABLE "project_skill_rates"`);
        await queryRunner.query(`DROP TYPE "public"."project_skill_rates_ratetype_enum"`);
        await queryRunner.query(`DROP TABLE "rate_variants"`);
    }

}
