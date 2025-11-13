import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectAllocationsController } from './project-allocations.controller';
import { ProjectAllocationsService } from './project-allocations.service';
import { ProjectAllocation } from './entities/project-allocation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectAllocation, Employee, Project])],
  controllers: [ProjectAllocationsController],
  providers: [ProjectAllocationsService],
  exports: [ProjectAllocationsService],
})
export class ProjectAllocationsModule {}
