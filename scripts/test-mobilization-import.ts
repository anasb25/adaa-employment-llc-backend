import 'dotenv/config';
import * as XLSX from 'xlsx';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MobilizationsService } from '../src/modules/mobilizations/mobilizations.service';
import { DataSource } from 'typeorm';

function buildTestExcel(rows: Record<string, string>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mobilizations');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function printTimesheetState(dataSource: DataSource, employeeId: number) {
  const rows = await dataSource.query(
    `
    SELECT te.date, t."projectId", p.name, te."jobStatus"
    FROM timesheet_entries te
    JOIN timesheets t ON t.id = te."timesheetId"
    JOIN projects p ON p.id = t."projectId"
    WHERE te."employeeId" = $1 AND t.month = '2026-08'
    ORDER BY te.date
    `,
    [employeeId],
  );

  const byProject = await dataSource.query(
    `
    SELECT t."projectId", p.name, COUNT(*)::int AS cnt,
           MIN(te.date) AS from_date, MAX(te.date) AS to_date
    FROM timesheet_entries te
    JOIN timesheets t ON t.id = te."timesheetId"
    JOIN projects p ON p.id = t."projectId"
    WHERE te."employeeId" = $1 AND t.month = '2026-08'
    GROUP BY t."projectId", p.name
    ORDER BY t."projectId"
    `,
    [employeeId],
  );

  console.log('\n--- Timesheet by project ---');
  console.table(byProject);
  console.log(`Total entry rows: ${rows.length}`);
}

async function printMobs(dataSource: DataSource, employeeId: number) {
  const mobs = await dataSource.query(
    `
    SELECT m.id, m."actionDate", m."jobStatus", m."projectId", p.name
    FROM mobilizations m
    LEFT JOIN projects p ON p.id = m."projectId"
    WHERE m."employeeId" = $1 AND m."actionDate" >= '2026-08-01'
    ORDER BY m."actionDate"
    `,
    [employeeId],
  );
  console.log('\n--- August mobilizations ---');
  console.table(mobs);
}

async function main() {
  const employeeId = 671; // A60189

  const importRows = [
    {
      'ID NO': 'A60189',
      NAME: 'YAGESWOR GIRI',
      'MOBILIZED TRADE': 'Helper',
      CLIENT: 'VAZIR GROUP',
      SITE: 'VAZIR GROUP LASR AUH',
      STATUS: 'Active',
      DATE: '2026-08-01',
    },
    {
      'ID NO': 'A60189',
      NAME: 'YAGESWOR GIRI',
      'MOBILIZED TRADE': 'Helper',
      CLIENT: 'VAZIR GROUP',
      SITE: 'VAZIR GROUP AL A2M AUH',
      STATUS: 'Active',
      DATE: '2026-08-10',
    },
    {
      'ID NO': 'A60189',
      NAME: 'YAGESWOR GIRI',
      'MOBILIZED TRADE': 'Helper',
      CLIENT: 'VAZIR GROUP',
      SITE: 'VAZIR GROUP AL A2M AUH',
      STATUS: 'Sick Leave',
      DATE: '2026-08-18',
    },
  ];

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const mobilizationsService = app.get(MobilizationsService);

    console.log('=== BEFORE import ===');
    await printMobs(dataSource, employeeId);
    await printTimesheetState(dataSource, employeeId);

    const buffer = buildTestExcel(importRows);
    const result = await mobilizationsService.importMobilizations(buffer, 1);

    console.log('\n=== Import result ===');
    console.log(`Success: ${result.success}, Failed: ${result.failed}`);
    if (result.errors.length) {
      console.log('Errors:', result.errors);
    }

    console.log('\n=== AFTER import ===');
    await printMobs(dataSource, employeeId);
    await printTimesheetState(dataSource, employeeId);

    const after = await dataSource.query(
      `
      SELECT t."projectId", COUNT(*)::int AS cnt
      FROM timesheet_entries te
      JOIN timesheets t ON t.id = te."timesheetId"
      WHERE te."employeeId" = $1 AND t.month = '2026-08'
      GROUP BY t."projectId"
      `,
      [employeeId],
    );

    const allOnLasr =
      after.length === 1 && Number(after[0].projectId) === 70 && after[0].cnt === 31;
    console.log(
      allOnLasr
        ? '\n✓ PASS: All 31 August days consolidated on LASR AUH (project 70)'
        : '\n✗ FAIL: Timesheet not fully consolidated on LASR AUH',
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
