import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { Project } from '../projects/entities/project.entity';
import { Payroll } from './entities/payroll.entity';
import { TimesheetsModule } from '../timesheets/timesheets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payroll, Timesheet, Project]),
    TimesheetsModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
