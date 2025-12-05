import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { Timesheet } from './entities/timesheet.entity';
import {
  CreateTimesheetDto,
  BulkCreateTimesheetDto,
} from './dto/create-timesheet.dto';
import { UpdateTimesheetDto } from './dto/update-timesheet.dto';
import { TimesheetFiltersDto } from './dto/timesheet-filters.dto';
import { GenerateDailyTimesheetsDto } from './dto/generate-daily-timesheets.dto';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get()
  async findAll(
    @Query() filters: TimesheetFiltersDto,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Timesheet>> {
    if (page !== undefined || limit !== undefined) {
      const paginationOptions = PaginationUtil.validatePaginationParams(
        page,
        limit,
      );
      return await this.timesheetsService.findAllPaginated(
        paginationOptions,
        filters,
      );
    }

    const all = await this.timesheetsService.findAll(filters);
    return {
      data: all,
      total: all.length,
      page: 1,
      limit: all.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('stats')
  async getStats(@Query() filters: TimesheetFiltersDto) {
    return await this.timesheetsService.getStats(filters);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('dashboard/analytics')
  async getDashboardAnalytics(@Query() filters: DashboardFiltersDto) {
    return await this.timesheetsService.getDashboardAnalytics(filters);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('by-date/:date')
  async findByDate(@Param('date') date: string): Promise<Timesheet[]> {
    return await this.timesheetsService.findByDate(date);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Timesheet | null> {
    return await this.timesheetsService.findOne(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('allocation/:allocationId')
  async findByAllocation(
    @Param('allocationId') allocationId: string,
  ): Promise<Timesheet[]> {
    return await this.timesheetsService.findByAllocation(+allocationId);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post()
  async create(
    @Body() createDto: CreateTimesheetDto,
    @CurrentUser() user: User,
  ): Promise<Timesheet> {
    return await this.timesheetsService.create(createDto, user.id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post('bulk')
  async bulkCreate(
    @Body() bulkDto: BulkCreateTimesheetDto,
    @CurrentUser() user: User,
  ): Promise<Timesheet[]> {
    return await this.timesheetsService.bulkCreate(bulkDto, user.id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTimesheetDto,
    @CurrentUser() user: User,
  ): Promise<Timesheet> {
    return await this.timesheetsService.update(+id, updateDto, user.id);
  }

  @Roles('admin')
  @Permissions('employee:delete')
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return await this.timesheetsService.remove(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post('generate-daily')
  async generateDaily(
    @Body() dto: GenerateDailyTimesheetsDto,
    @CurrentUser() user: User,
  ): Promise<{ created: number; existing: number; message: string }> {
    const result = await this.timesheetsService.generateDailyTimesheets(
      dto.date,
      user.id,
    );
    return {
      ...result,
      message: `Generated ${result.created} new timesheets. ${result.existing} already existed.`,
    };
  }
}

