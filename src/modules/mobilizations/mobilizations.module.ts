import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobilizationsService } from './mobilizations.service';
import { MobilizationsController } from './mobilizations.controller';
import { Mobilization } from './entities/mobilization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Project } from '../projects/entities/project.entity';
import { Skill } from '../skills/entities/skill.entity';
import { Client } from '../clients/entities/client.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Mobilization,
      Employee,
      Project,
      Skill,
      Client,
    ]),
  ],
  controllers: [MobilizationsController],
  providers: [MobilizationsService],
  exports: [MobilizationsService, TypeOrmModule],
})
export class MobilizationsModule {}

