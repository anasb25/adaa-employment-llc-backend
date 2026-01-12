import { MigrationInterface, QueryRunner } from 'typeorm';

export class Aaaa1768164860636 implements MigrationInterface {
  name = 'Aaaa1768164860636';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invoices_status_enum" AS ENUM('draft', 'pending', 'approved', 'sent', 'paid', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "createdBy" integer, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedBy" integer, "deletedAt" TIMESTAMP, "deletedBy" integer, "invoiceNumber" character varying NOT NULL, "projectId" integer NOT NULL, "month" character varying(7) NOT NULL, "invoiceDate" date NOT NULL, "dueDate" date NOT NULL, "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'draft', "subject" text, "notes" text, "lineItems" jsonb NOT NULL, "totalTaxableAmount" numeric(12,2) NOT NULL DEFAULT '0', "totalTax" numeric(12,2) NOT NULL DEFAULT '0', "totalAmount" numeric(12,2) NOT NULL DEFAULT '0', "totalInWords" text, "paidDate" date, "paymentReference" text, "approvedDate" date, "approvedBy" integer, "sentDate" date, CONSTRAINT "UQ_bf8e0f9dd4558ef209ec111782d" UNIQUE ("invoiceNumber"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4327b701e893585e9685089757" ON "invoices" ("projectId", "month") `,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_20d900c6b7f2de7faa4d214d64d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4327b701e893585e9685089757"`,
    );
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
  }
}
1;
