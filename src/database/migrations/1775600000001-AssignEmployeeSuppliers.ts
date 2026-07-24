import { MigrationInterface, QueryRunner } from 'typeorm';

const ADAA_SUPPLIER = 'ADAA';
const JABL_AL_SAFI_SUPPLIER = 'Jabl Al Safi Building Contracting LLC';

export class AssignEmployeeSuppliers1775600000001
  implements MigrationInterface
{
  name = 'AssignEmployeeSuppliers1775600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO "suppliers" ("name", "createdAt", "updatedAt")
      VALUES ($1, NOW(), NOW())
      ON CONFLICT ("name") DO NOTHING
    `,
      [ADAA_SUPPLIER],
    );

    await queryRunner.query(
      `
      INSERT INTO "suppliers" ("name", "createdAt", "updatedAt")
      VALUES ($1, NOW(), NOW())
      ON CONFLICT ("name") DO NOTHING
    `,
      [JABL_AL_SAFI_SUPPLIER],
    );

    // JA prefix first so codes like JA123 are not matched as ADAA (A...)
    await queryRunner.query(
      `
      UPDATE "employees"
      SET "supplierId" = (SELECT id FROM "suppliers" WHERE "name" = $1)
      WHERE UPPER("adaa_emp_code") LIKE 'JA%'
    `,
      [JABL_AL_SAFI_SUPPLIER],
    );

    await queryRunner.query(
      `
      UPDATE "employees"
      SET "supplierId" = (SELECT id FROM "suppliers" WHERE "name" = $1)
      WHERE UPPER("adaa_emp_code") LIKE 'A%'
        AND UPPER("adaa_emp_code") NOT LIKE 'JA%'
    `,
      [ADAA_SUPPLIER],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "employees"
      SET "supplierId" = NULL
      WHERE UPPER("adaa_emp_code") LIKE 'JA%'
         OR (UPPER("adaa_emp_code") LIKE 'A%' AND UPPER("adaa_emp_code") NOT LIKE 'JA%')
    `);
  }
}
