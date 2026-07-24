import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService, EmployeeWithExpiringDocs } from './dashboard.service';
import { DashboardStats } from './dashboard-stats.interface';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@Query('month') month?: string): Promise<DashboardStats> {
    return this.dashboardService.getDashboardStats(month);
  }

  @Get('expiring-documents')
  async getExpiringDocuments(): Promise<EmployeeWithExpiringDocs[]> {
    return this.dashboardService.getEmployeesWithExpiringDocuments();
  }
}

