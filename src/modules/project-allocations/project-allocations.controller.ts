import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ProjectAllocationsService } from './project-allocations.service';
import { ProjectAllocation } from './entities/project-allocation.entity';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { UpdateAllocationDto } from './dto/update-allocation.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('project-allocations')
export class ProjectAllocationsController {
  constructor(private readonly allocationsService: ProjectAllocationsService) {}

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<ProjectAllocation>> {
    if (page !== undefined || limit !== undefined) {
      const paginationOptions = PaginationUtil.validatePaginationParams(
        page,
        limit,
      );
      return await this.allocationsService.findAllPaginated(paginationOptions);
    }
    const all = await this.allocationsService.findAll();
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
  @Get('actions/search')
  async search(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<ProjectAllocation>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.allocationsService.search(query, paginationOptions);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('by-project/:projectId')
  async findByProject(
    @Param('projectId') projectId: string,
  ): Promise<ProjectAllocation[]> {
    return await this.allocationsService.findByProject(+projectId);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('by-employee/:employeeId')
  async findByEmployee(
    @Param('employeeId') employeeId: string,
  ): Promise<ProjectAllocation[]> {
    return await this.allocationsService.findByEmployee(+employeeId);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.allocationsService.findOne(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:create')
  @Post()
  create(@Body() createDto: CreateAllocationDto, @CurrentUser() user: User) {
    return this.allocationsService.createBulk(createDto, user.id);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateAllocationDto,
    @CurrentUser() user: User,
  ) {
    return await this.allocationsService.update(+id, updateDto, user.id);
  }

  @Roles('admin')
  @Permissions('employee:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.allocationsService.remove(+id);
  }
}
