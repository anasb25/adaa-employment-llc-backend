import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
import { TimesheetsCronService } from './timesheets-cron.service';
import { Timesheet } from './entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Timesheet,
      ProjectAllocation,
      Employee,
      Skill,
      Project,
    ]),
  ],
  controllers: [TimesheetsController],
  providers: [TimesheetsService, TimesheetsCronService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}

