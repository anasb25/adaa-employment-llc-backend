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
import { Skill } from '../skills/entities/skill.entity';
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
      Skill,
    ]),
    TimesheetsModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
