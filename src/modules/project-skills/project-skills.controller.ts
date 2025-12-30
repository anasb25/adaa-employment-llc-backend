import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ProjectSkillsService } from './project-skills.service';
import { AssignProjectSkillDto } from './dto/assign-project-skill.dto';
import { UpdateProjectSkillDto } from './dto/update-project-skill.dto';
import {
  CreateProjectSkillRateDto,
  BulkCreateProjectSkillRatesDto,
} from './dto/create-project-skill-rate.dto';
import { Roles, Permissions, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';

@Controller('projects/:projectId/skills')
@UseGuards(JwtAuthGuard)
export class ProjectSkillsController {
  constructor(private readonly projectSkillsService: ProjectSkillsService) {}

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get()
  async getProjectSkills(@Param('projectId') projectId: string) {
    return await this.projectSkillsService.getProjectSkills(+projectId);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Post()
  async assignSkill(
    @Param('projectId') projectId: string,
    @Body() assignSkillDto: AssignProjectSkillDto,
  ) {
    return await this.projectSkillsService.assignSkillToProject(
      +projectId,
      assignSkillDto.skillId,
      assignSkillDto.sale_price,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Put(':skillId')
  async updateSalePrice(
    @Param('projectId') projectId: string,
    @Param('skillId') skillId: string,
    @Body() updateDto: UpdateProjectSkillDto,
  ) {
    if (updateDto.sale_price === undefined) {
      throw new Error('sale_price is required');
    }
    return await this.projectSkillsService.updateSalePrice(
      +projectId,
      +skillId,
      updateDto.sale_price,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Delete(':skillId')
  async removeSkill(
    @Param('projectId') projectId: string,
    @Param('skillId') skillId: string,
  ) {
    await this.projectSkillsService.removeSkillFromProject(
      +projectId,
      +skillId,
    );
    return { message: 'Skill removed from project successfully' };
  }

  // ============= RATE ENDPOINTS =============

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get(':skillId/rates')
  async getSkillRates(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return await this.projectSkillsService.getProjectSkillRates(
      projectId,
      skillId,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get('rates/all')
  async getAllProjectRates(@Param('projectId', ParseIntPipe) projectId: number) {
    return await this.projectSkillsService.getProjectSkillRatesForProject(
      projectId,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Post(':skillId/rates')
  async createSkillRate(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Body() dto: Omit<CreateProjectSkillRateDto, 'projectId' | 'skillId'>,
    @CurrentUser() user: User,
  ) {
    return await this.projectSkillsService.createProjectSkillRate(
      { projectId, skillId, ...dto },
      user.id,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Post(':skillId/rates/bulk')
  async bulkCreateSkillRates(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Body() dto: Omit<BulkCreateProjectSkillRatesDto, 'projectId' | 'skillId'>,
    @CurrentUser() user: User,
  ) {
    return await this.projectSkillsService.bulkCreateProjectSkillRates(
      { projectId, skillId, ...dto },
      user.id,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Delete(':skillId/rates/:rateVariantId')
  async deleteSkillRate(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Param('rateVariantId', ParseIntPipe) rateVariantId: number,
  ) {
    await this.projectSkillsService.deleteProjectSkillRate(
      projectId,
      skillId,
      rateVariantId,
    );
    return { message: 'Rate deleted successfully' };
  }

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get(':skillId/rates/:rateVariantId/calculate')
  async getApplicableRate(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Param('rateVariantId', ParseIntPipe) rateVariantId: number,
  ) {
    return await this.projectSkillsService.getApplicableRate(
      projectId,
      skillId,
      rateVariantId,
    );
  }
}
