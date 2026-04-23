import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { Project } from '../projects/entities/project.entity';
import { Payroll } from './entities/payroll.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import { ProjectSpecialDayRate } from '../projects/entities/project-special-day-rate.entity';
import { ProjectRateVariantRate } from '../projects/entities/project-rate-variant-rate.entity';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payroll,
      Timesheet,
      Project,
      RateVariant,
      SpecialDay,
      EmployeeSkill,
      ProjectSpecialDayRate,
      ProjectRateVariantRate,
    ]),
    TimesheetsModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
