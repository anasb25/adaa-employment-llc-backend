import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
import { Timesheet } from './entities/timesheet.entity';
import { TimesheetEntry } from './entities/timesheet-entry.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Timesheet,
      TimesheetEntry,
      Mobilization,
      Employee,
      Skill,
      Project,
    ]),
  ],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
