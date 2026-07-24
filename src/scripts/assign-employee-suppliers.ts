/**
 * Assigns suppliers to employees based on ADAA employee code prefix:
 * - JA* → Jabl Al Safi Building Contracting LLC
 * - A*  → ADAA (excluding JA* codes)
 *
 * Usage: npm run assign-suppliers
 */
import 'dotenv/config';
import { AppDataSource } from '../database/data-source';

const ADAA_SUPPLIER = 'ADAA';
const JABL_AL_SAFI_SUPPLIER = 'Jabl Al Safi Building Contracting LLC';

async function assignEmployeeSuppliers(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await AppDataSource.query(
      `
      INSERT INTO "suppliers" ("name", "createdAt", "updatedAt")
      VALUES ($1, NOW(), NOW())
      ON CONFLICT ("name") DO NOTHING
    `,
      [ADAA_SUPPLIER],
    );

    await AppDataSource.query(
      `
      INSERT INTO "suppliers" ("name", "createdAt", "updatedAt")
      VALUES ($1, NOW(), NOW())
      ON CONFLICT ("name") DO NOTHING
    `,
      [JABL_AL_SAFI_SUPPLIER],
    );

    const jablResult = await AppDataSource.query(
      `
      UPDATE "employees"
      SET "supplierId" = (SELECT id FROM "suppliers" WHERE "name" = $1)
      WHERE UPPER("adaa_emp_code") LIKE 'JA%'
      RETURNING id
    `,
      [JABL_AL_SAFI_SUPPLIER],
    );

    const adaaResult = await AppDataSource.query(
      `
      UPDATE "employees"
      SET "supplierId" = (SELECT id FROM "suppliers" WHERE "name" = $1)
      WHERE UPPER("adaa_emp_code") LIKE 'A%'
        AND UPPER("adaa_emp_code") NOT LIKE 'JA%'
      RETURNING id
    `,
      [ADAA_SUPPLIER],
    );

    console.log(
      `Assigned ${adaaResult.length} employee(s) to ${ADAA_SUPPLIER}`,
    );
    console.log(
      `Assigned ${jablResult.length} employee(s) to ${JABL_AL_SAFI_SUPPLIER}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

assignEmployeeSuppliers().catch((error) => {
  console.error('Failed to assign employee suppliers:', error);
  process.exit(1);
});
