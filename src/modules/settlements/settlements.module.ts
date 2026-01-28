import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { Settlement } from './entities/settlement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeSkill } from '../employee-skills/entities/employee-skill.entity';
import { Skill } from '../skills/entities/skill.entity';
import { SettlementExcelService } from './services/settlement-excel.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Employee, EmployeeSkill, Skill]),
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementExcelService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
