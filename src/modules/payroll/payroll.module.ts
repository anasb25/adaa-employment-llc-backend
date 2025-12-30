import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Employee } from '../employees/entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';
import { SpecialDay } from '../special-days/entities/special-day.entity';
import { Project } from '../projects/entities/project.entity';
import { Payroll } from './entities/payroll.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payroll,
      Employee,
      Timesheet,
      TimesheetEntry,
      Mobilization,
      SpecialDay,
      Project,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
