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
} from '@nestjs/common';
import { MobilizationsService } from './mobilizations.service';
import { CreateMobilizationDto, BulkCreateMobilizationDto } from './dto/create-mobilization.dto';
import { UpdateMobilizationDto } from './dto/update-mobilization.dto';
import { MobilizationFiltersDto } from './dto/mobilization-filters.dto';
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

  @Get('employee/:employeeId/latest')
  @Roles('admin', 'manager', 'supervisor')
  @Permissions('employee:read')
  async getLatestForEmployee(@Param('employeeId') employeeId: string) {
    return await this.mobilizationsService.getLatestForEmployee(+employeeId);
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
}

