import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSkillsController } from './employee-skills.controller';
import { EmployeeSkillsService } from './employee-skills.service';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeSkill,
      Employee,
      Skill,
    ]),
  ],
  controllers: [EmployeeSkillsController],
  providers: [EmployeeSkillsService],
  exports: [EmployeeSkillsService],
})
export class EmployeeSkillsModule {}

