import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSkillsController } from './employee-skills.controller';
import { EmployeeSkillsService } from './employee-skills.service';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { EmployeeSkillRate } from './entities/employee-skill-rate.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SkillRate } from '../skills/entities/skill-rate.entity';
import { RateVariant } from '../rate-variants/entities/rate-variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeSkill,
      EmployeeSkillRate,
      Employee,
      Skill,
      SkillRate,
      RateVariant,
    ]),
  ],
  controllers: [EmployeeSkillsController],
  providers: [EmployeeSkillsService],
  exports: [EmployeeSkillsService],
})
export class EmployeeSkillsModule {}

