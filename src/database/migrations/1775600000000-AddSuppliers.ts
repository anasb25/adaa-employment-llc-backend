import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuppliers1775600000000 implements MigrationInterface {
  name = 'AddSuppliers1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdBy" integer,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedBy" integer,
        "deletedAt" TIMESTAMP,
        "deletedBy" integer,
        "name" character varying NOT NULL,
        CONSTRAINT "UQ_suppliers_name" UNIQUE ("name"),
        CONSTRAINT "PK_suppliers_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "supplierId" integer
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_employees_supplier'
        ) THEN
          ALTER TABLE "employees"
          ADD CONSTRAINT "FK_employees_supplier"
          FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_employees_supplier"
    `);
    await queryRunner.query(`
      ALTER TABLE "employees" DROP COLUMN IF EXISTS "supplierId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }
}
