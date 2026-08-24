import 'dotenv/config';
import * as XLSX from 'xlsx';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MobilizationsService } from '../src/modules/mobilizations/mobilizations.service';
import { DataSource } from 'typeorm';

async function main() {
  const row = {
    'ID NO': 'A50096',
    'MOBILIZED TRADE': 'SHUTTERING CARPENTE',
    CLIENT: 'UNITED MANAGEMENT',
    SITE: 'UNITED APEX E20',
    STATUS: 'Active',
    DATE: '24/08/2026',
  };

  const ws = XLSX.utils.json_to_sheet([row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mobilizations');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ds = app.get(DataSource);
    const svc = app.get(MobilizationsService);
    const employeeId = 346;

    console.log('=== BEFORE ===');
    const beforeMobs = await ds.query(
      `SELECT m.id, m."actionDate", m."jobStatus", m."projectId", p.name
       FROM mobilizations m LEFT JOIN projects p ON p.id=m."projectId"
       WHERE m."employeeId"=$1 AND m."actionDate">='2026-08-01' ORDER BY m."actionDate"`,
      [employeeId],
    );
    console.table(beforeMobs);

    const beforeTs = await ds.query(
      `SELECT t."projectId", p.name, COUNT(*)::int cnt
       FROM timesheet_entries te JOIN timesheets t ON t.id=te."timesheetId"
       JOIN projects p ON p.id=t."projectId"
       WHERE te."employeeId"=$1 AND t.month='2026-08' GROUP BY t."projectId", p.name`,
      [employeeId],
    );
    console.log('Timesheet before:', beforeTs);

    const result = await svc.importMobilizations(buffer, 1);
    console.log('\n=== IMPORT RESULT ===');
    console.log({ success: result.success, failed: result.failed, errors: result.errors });
    if (result.imported.length) {
      console.log('Imported:', result.imported.map((m: any) => ({
        id: m.id,
        date: m.actionDate,
        projectId: m.projectId,
        jobStatus: m.jobStatus,
      })));
    }

    console.log('\n=== AFTER ===');
    const afterMobs = await ds.query(
      `SELECT m.id, m."actionDate", m."jobStatus", m."projectId", p.name
       FROM mobilizations m LEFT JOIN projects p ON p.id=m."projectId"
       WHERE m."employeeId"=$1 AND m."actionDate">='2026-08-01' ORDER BY m."actionDate"`,
      [employeeId],
    );
    console.table(afterMobs);

    const afterTs = await ds.query(
      `SELECT te.date, t."projectId", p.name, te."jobStatus", te."hoursWorked"
       FROM timesheet_entries te JOIN timesheets t ON t.id=te."timesheetId"
       JOIN projects p ON p.id=t."projectId"
       WHERE te."employeeId"=$1 AND t.month='2026-08' ORDER BY te.date`,
      [employeeId],
    );
    console.table(afterTs);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
