import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillType } from './entities/skill-type.entity';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import { User } from '../users/entities/user.entity';

@Controller('skill-types')
export class SkillTypesController {
  constructor(private readonly skillsService: SkillsService) {}

  @Roles('admin')
  @Permissions('skill:read')
  @Get()
  getSkillTypes(): Promise<SkillType[]> {
    return this.skillsService.getSkillTypes();
  }

  @Roles('admin')
  @Permissions('skill:create')
  @Post()
  createSkillType(
    @Body() body: { type: string },
    @CurrentUser() user: User,
  ): Promise<SkillType> {
    return this.skillsService.createSkillType({
      type: body.type,
      createdBy: user.id,
    });
  }

  @Roles('admin')
  @Permissions('skill:update')
  @Put(':id')
  updateSkillType(
    @Param('id') id: string,
    @Body() body: { type: string },
    @CurrentUser() user: User,
  ): Promise<SkillType> {
    return this.skillsService.updateSkillType(+id, {
      type: body.type,
      updatedBy: user.id,
    });
  }

  @Roles('admin')
  @Permissions('skill:delete')
  @Delete(':id')
  removeSkillType(@Param('id') id: string) {
    return this.skillsService.removeSkillType(+id);
  }
}
