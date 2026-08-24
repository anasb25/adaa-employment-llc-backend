import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MobilizationsService } from '../src/modules/mobilizations/mobilizations.service';

async function main() {
  const mobilizationId = Number(process.argv[2]);
  if (!Number.isFinite(mobilizationId)) {
    console.error('Usage: npx ts-node -r tsconfig-paths/register scripts/resync-mobilization.ts <mobilizationId>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const mobilizationsService = app.get(MobilizationsService);
    await mobilizationsService.resyncTimesheetForMobilization(mobilizationId, 1);
    console.log(`Resynced timesheet for mobilization ${mobilizationId}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
