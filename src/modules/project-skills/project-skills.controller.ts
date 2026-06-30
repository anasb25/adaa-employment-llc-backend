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
import { Roles, Permissions } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

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

}
