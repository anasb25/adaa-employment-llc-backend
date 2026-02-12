import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Employee } from '../employees/entities/employee.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, Mobilization])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
