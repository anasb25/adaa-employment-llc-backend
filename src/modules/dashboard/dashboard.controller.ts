import { Controller, Get } from '@nestjs/common';
import { DashboardService, EmployeeWithExpiringDocs } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('expiring-documents')
  async getExpiringDocuments(): Promise<EmployeeWithExpiringDocs[]> {
    return this.dashboardService.getEmployeesWithExpiringDocuments();
  }
}

