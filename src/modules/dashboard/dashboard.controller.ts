import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DashboardService, EmployeeWithExpiringDocs } from './dashboard.service';
import { DashboardStats } from './dashboard-stats.interface';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';

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

  @Get('active-workforce/export')
  @Roles('admin', 'manager')
  @Permissions('employee:read')
  async exportActiveWorkforce(@Res() res: Response) {
    const buffer = await this.dashboardService.exportActiveWorkforce();
    const date = new Date().toISOString().split('T')[0];

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=active_workforce_${date}.xlsx`,
    );

    res.send(buffer);
  }
}

