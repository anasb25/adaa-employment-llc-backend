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
import { ProjectsService } from './projects.service';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CurrentUser } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginatedResponse,
  PaginationUtil,
} from '../../common/utils/pagination.util';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Project>> {
    if (page !== undefined || limit !== undefined) {
      const paginationOptions = PaginationUtil.validatePaginationParams(
        page,
        limit,
      );
      return await this.projectsService.findAllPaginated(paginationOptions);
    }
    const all = await this.projectsService.findAll();
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
  ): Promise<PaginatedResponse<Project>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.projectsService.search(query, paginationOptions);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(+id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: User) {
    return this.projectsService.create({
      ...dto,
      createdBy: user.id,
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateProjectDto>,
    @CurrentUser() user: User,
  ) {
    return this.projectsService.update(+id, {
      ...dto,
      updatedBy: user.id,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(+id);
  }
}
