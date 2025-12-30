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
  UseGuards,
} from '@nestjs/common';
import { SkillsService } from './skills.service';
import { Skill } from './entities/skill.entity';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('skills')
@UseGuards(JwtAuthGuard)
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
  create(@Body() createSkillDto: CreateSkillDto, @CurrentUser() user: User) {
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

  // ============= SKILL RATES ENDPOINTS =============

  @Roles('admin', 'manager')
  @Permissions('skill:read')
  @Get(':id/rates')
  async getSkillRates(@Param('id', ParseIntPipe) id: number) {
    return await this.skillsService.getSkillRates(id);
  }

  @Roles('admin', 'manager')
  @Permissions('skill:update')
  @Post(':id/rates')
  async createSkillRate(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      rateVariantId: number;
      employeeRateValue: number;
      clientRateValue: number;
      rateType: string;
      notes?: string;
    },
    @CurrentUser() user: User,
  ) {
    return await this.skillsService.createSkillRate(
      id,
      body.rateVariantId,
      body.employeeRateValue,
      body.clientRateValue,
      body.rateType,
      body.notes,
      user.id,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('skill:update')
  @Post(':id/rates/bulk')
  async bulkCreateSkillRates(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      rates: Array<{
        rateVariantId: number;
        employeeRateValue: number;
        clientRateValue: number;
        rateType: string;
        notes?: string;
      }>;
    },
    @CurrentUser() user: User,
  ) {
    return await this.skillsService.bulkCreateSkillRates(
      id,
      body.rates,
      user.id,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('skill:delete')
  @Delete(':id/rates/:rateVariantId')
  async deleteSkillRate(
    @Param('id', ParseIntPipe) id: number,
    @Param('rateVariantId', ParseIntPipe) rateVariantId: number,
  ) {
    await this.skillsService.deleteSkillRate(id, rateVariantId);
    return { message: 'Rate deleted successfully' };
  }

  @Roles('admin', 'manager')
  @Permissions('skill:read')
  @Get(':id/rates/:rateVariantId/calculate')
  async getCalculatedRate(
    @Param('id', ParseIntPipe) id: number,
    @Param('rateVariantId', ParseIntPipe) rateVariantId: number,
  ) {
    return await this.skillsService.getCalculatedRate(id, rateVariantId);
  }
}
