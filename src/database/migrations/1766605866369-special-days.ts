import { MigrationInterface, QueryRunner } from 'typeorm';

export class SpecialDays1766605866369 implements MigrationInterface {
  name = 'SpecialDays1766605866369';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "special_days" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "name" character varying NOT NULL, "category" character varying, "startDate" date NOT NULL, "endDate" date, "description" text, "isActive" boolean NOT NULL DEFAULT true, "isRecurring" boolean NOT NULL DEFAULT false, "color" character varying, CONSTRAINT "PK_c1ae5de188b9a05179039d5d065" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b24e1bacbe9809aa5d098899ea" ON "special_days" ("startDate", "endDate") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b24e1bacbe9809aa5d098899ea"`,
    );
    await queryRunner.query(`DROP TABLE "special_days"`);
  }
}
