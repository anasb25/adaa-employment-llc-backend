import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { ProjectAllocation } from '../project-allocations/entities/project-allocation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, Timesheet, ProjectAllocation])],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
