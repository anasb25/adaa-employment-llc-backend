import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MobilizationsService } from './mobilizations.service';
import {
  CreateMobilizationDto,
  BulkCreateMobilizationDto,
} from './dto/create-mobilization.dto';
import { UpdateMobilizationDto } from './dto/update-mobilization.dto';
import { MobilizationFiltersDto } from './dto/mobilization-filters.dto';
import { ImportMobilizationResult } from './dto/import-mobilization.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { PaginationUtil } from '../../common/utils/pagination.util';

@Controller('mobilizations')
export class MobilizationsController {
  constructor(private readonly mobilizationsService: MobilizationsService) {}

  @Post()
  @Roles('admin', 'manager')
  @Permissions('employee:create')
  async create(
    @Body() createDto: CreateMobilizationDto,
    @CurrentUser() user: User,
  ) {
    return await this.mobilizationsService.create(createDto, user.id);
  }

  @Post('bulk')
  @Roles('admin', 'manager')
  @Permissions('employee:create')
  async createBulk(
    @Body() createDto: BulkCreateMobilizationDto,
    @CurrentUser() user: User,
  ) {
    return await this.mobilizationsService.createBulk(createDto, user.id);
  }

  @Get()
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async findAll(
    @Query() paginationQuery: any,
    @Query() filters: MobilizationFiltersDto,
  ) {
    const page = parseInt(paginationQuery.page) || 1;
    const limit = parseInt(paginationQuery.limit) || 20;
    return await this.mobilizationsService.findAll({ page, limit }, filters);
  }

  @Get('statistics')
  @Roles('admin', 'manager')
  @Permissions('employee:read')
  async getStatistics(@Query('projectId') projectId?: number) {
    return await this.mobilizationsService.getStatistics(projectId);
  }

  @Get('current-status')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getCurrentStatusForAllEmployees() {
    return await this.mobilizationsService.getCurrentStatusForAllEmployees();
  }

  @Get('effective-status-on-date')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getEffectiveStatusForAllEmployeesOnDate(
    @Query('date') date: string,
    @Query('includeDemobilized') includeDemobilized?: string,
  ) {
    if (!date) {
      throw new BadRequestException('Date query parameter is required');
    }
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return await this.mobilizationsService.getEffectiveStatusForAllEmployeesOnDate(
      targetDate,
      includeDemobilized === 'true',
    );
  }

  @Get('employee/:employeeId/latest')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getLatestForEmployee(@Param('employeeId') employeeId: string) {
    return await this.mobilizationsService.getLatestForEmployee(+employeeId);
  }

  @Get('employee/:employeeId/status-on-date')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getEffectiveStatusOnDate(
    @Param('employeeId') employeeId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException('Date query parameter is required');
    }
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return await this.mobilizationsService.getEffectiveStatusOnDate(
      +employeeId,
      targetDate,
    );
  }

  @Get('employee/:employeeId/history')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getEmployeeHistory(
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start && isNaN(start.getTime())) {
      throw new BadRequestException('Invalid startDate format');
    }
    if (end && isNaN(end.getTime())) {
      throw new BadRequestException('Invalid endDate format');
    }

    return await this.mobilizationsService.getEmployeeHistory(
      +employeeId,
      start,
      end,
    );
  }

  @Get('project/:projectId/employees')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getEmployeesOnProject(@Param('projectId') projectId: string) {
    return await this.mobilizationsService.getEmployeesOnProject(+projectId);
  }

  @Get(':id')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async findOne(@Param('id') id: string) {
    return await this.mobilizationsService.findOne(+id);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @Permissions('employee:update')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateMobilizationDto,
    @CurrentUser() user: User,
  ) {
    return await this.mobilizationsService.update(+id, updateDto, user.id);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @Permissions('employee:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    return await this.mobilizationsService.remove(+id, user.id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('actions/export')
  async exportMobilizations(@Res() res: Response) {
    const buffer = await this.mobilizationsService.exportMobilizations();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=mobilizations_export_${new Date().toISOString().split('T')[0]}.xlsx`,
    );

    res.send(buffer);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('actions/import-template')
  getImportTemplate(@Res() res: Response) {
    const buffer = this.mobilizationsService.generateImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=mobilization_import_template.xlsx',
    );

    res.send(buffer);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post('actions/import')
  @UseInterceptors(FileInterceptor('file'))
  async importMobilizations(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ): Promise<ImportMobilizationResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (
      !file.mimetype.includes('spreadsheet') &&
      !file.mimetype.includes('excel') &&
      !file.originalname.endsWith('.xlsx')
    ) {
      throw new BadRequestException(
        'Invalid file type. Please upload an Excel file (.xlsx)',
      );
    }

    return await this.mobilizationsService.importMobilizations(
      file.buffer,
      user.id,
    );
  }
}
