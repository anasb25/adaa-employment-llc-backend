import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { Invoice } from './entities/invoice.entity';
import { Project } from '../projects/entities/project.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { ProjectSkill } from '../project-skills/entities/project-skill.entity';
import { Skill } from '../skills/entities/skill.entity';
import { ProjectSpecialDayRate } from '../projects/entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice,
      Project,
      Timesheet,
      TimesheetEntry,
      RateVariant,
      SpecialDay,
      ProjectSkill,
      Skill,
      ProjectSpecialDayRate,
      ProjectRateVariantRate,
    ]),
    TimesheetsModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

