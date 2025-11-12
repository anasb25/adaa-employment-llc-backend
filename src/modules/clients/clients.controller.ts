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
import { ClientsService } from './clients.service';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Client>> {
    if (page !== undefined || limit !== undefined) {
      const paginationOptions = PaginationUtil.validatePaginationParams(
        page,
        limit,
      );
      return await this.clientsService.findAllPaginated(paginationOptions);
    }
    const all = await this.clientsService.findAll();
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

  @Get('actions/search')
  async search(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Client>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.clientsService.search(query, paginationOptions);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(+id);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: User) {
    return this.clientsService.create({
      ...dto,
      createdBy: user.id,
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: User,
  ) {
    return this.clientsService.update(+id, {
      ...dto,
      updatedBy: user.id,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clientsService.remove(+id);
  }
}
