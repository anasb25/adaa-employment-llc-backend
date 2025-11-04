import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { SkillsService } from './skills.service';
import { Skill } from './entities/skill.entity';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Roles('admin', 'manager')
  @Permissions('skill:read')
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Skill>> {
    if (page !== undefined || limit !== undefined) {
      const paginationOptions = PaginationUtil.validatePaginationParams(
        page,
        limit,
      );
      return await this.skillsService.findAllPaginated(paginationOptions);
    }
    // Return all skills if no pagination params
    const allSkills = await this.skillsService.findAll();
    return {
      data: allSkills,
      total: allSkills.length,
      page: 1,
      limit: allSkills.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  @Roles('admin', 'manager')
  @Permissions('skill:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.skillsService.findOne(+id);
  }

  @Roles('admin', 'manager')
  @Permissions('skill:create')
  @Post()
  create(
    @Body() createSkillDto: CreateSkillDto,
    @CurrentUser() user: User,
  ) {
    return this.skillsService.create({
      ...createSkillDto,
      createdBy: user.id,
    });
  }

  @Roles('admin', 'manager')
  @Permissions('skill:read')
  @Get('actions/search')
  async searchSkills(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<Skill>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );

    return await this.skillsService.searchSkills(query, paginationOptions);
  }

  @Roles('admin', 'manager')
  @Permissions('skill:update')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSkillDto: UpdateSkillDto,
    @CurrentUser() user: User,
  ) {
    return await this.skillsService.update(+id, {
      ...updateSkillDto,
      updatedBy: user.id,
    });
  }

  @Roles('admin')
  @Permissions('skill:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.skillsService.remove(+id);
  }
}

