import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { Settlement } from './entities/settlement.entity';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { UpdateSettlementDto } from './dto/update-settlement.dto';
import { CurrentUser, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Permissions('settlement:read')
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Settlement>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.settlementsService.findAllPaginated(paginationOptions);
  }

  @Permissions('settlement:read')
  @Get('actions/search')
  async search(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Settlement>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.settlementsService.searchSettlements(
      query,
      paginationOptions,
    );
  }

  @Permissions('settlement:read')
  @Get('actions/calculate-gratuity/:employeeId')
  async calculateGratuity(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('lastDateOfWork') lastDateOfWork?: string,
  ): Promise<{
    totalYearsOfService: number;
    gratuityAmount: number;
    eligibleDays: number;
  }> {
    const date = lastDateOfWork ? new Date(lastDateOfWork) : undefined;
    return await this.settlementsService.calculateGratuity(employeeId, date);
  }

  @Permissions('settlement:read')
  @Get('employee/:employeeId')
  async findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Settlement>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.settlementsService.findByEmployee(
      employeeId,
      paginationOptions,
    );
  }

  @Permissions('settlement:read')
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Settlement> {
    return await this.settlementsService.findOne(id);
  }

  @Permissions('settlement:create')
  @Post()
  async create(
    @Body() createSettlementDto: CreateSettlementDto,
    @CurrentUser() user: User,
  ): Promise<Settlement> {
    return await this.settlementsService.create(createSettlementDto, user.id);
  }

  @Permissions('settlement:update')
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSettlementDto: UpdateSettlementDto,
    @CurrentUser() user: User,
  ): Promise<Settlement> {
    return await this.settlementsService.update(
      id,
      updateSettlementDto,
      user.id,
    );
  }

  @Permissions('settlement:delete')
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.settlementsService.remove(id, user.id);
    return { message: 'Settlement deleted successfully' };
  }

  @Permissions('settlement:approve')
  @Post(':id/approve')
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<Settlement> {
    return await this.settlementsService.approve(id, user.id);
  }

  @Permissions('settlement:update')
  @Post(':id/mark-paid')
  async markAsPaid(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ): Promise<Settlement> {
    return await this.settlementsService.markAsPaid(id, user.id);
  }
}
