import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';
import { Skill } from '../skills/entities/skill.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Timesheet,
      ProjectAllocation,
      Skill,
      EmployeeSkill,
    ]),
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
