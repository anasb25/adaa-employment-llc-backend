import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Employee } from '../employees/entities/employee.entity';
import { Mobilization } from '../mobilizations/entities/mobilization.entity';
import { MobilizationsModule } from '../mobilizations/mobilizations.module';
import { Project } from '../projects/entities/project.entity';
import { Client } from '../clients/entities/client.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { Payroll } from '../payroll/entities/payroll.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Settlement } from '../settlements/entities/settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Mobilization,
      Project,
      Client,
      Timesheet,
      Payroll,
      Invoice,
      Settlement,
    ]),
    MobilizationsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
