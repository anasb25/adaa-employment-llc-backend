import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { EmployeeSkillsService } from './employee-skills.service';
import { AssignSkillDto } from './dto/assign-skill.dto';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';

@Controller('employees/:employeeId/skills')
export class EmployeeSkillsController {
  constructor(private readonly employeeSkillsService: EmployeeSkillsService) {}

  @Roles('admin', 'manager')
  @Permissions('employee:read')
  @Get()
  async getEmployeeSkills(@Param('employeeId') employeeId: string) {
    return await this.employeeSkillsService.getEmployeeSkills(+employeeId);
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Post()
  async assignSkill(
    @Param('employeeId') employeeId: string,
    @Body() assignSkillDto: AssignSkillDto,
  ) {
    return await this.employeeSkillsService.assignSkillToEmployee(
      +employeeId,
      assignSkillDto.skillId,
      assignSkillDto.rating,
      assignSkillDto.cost_price,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Put(':skillId/rating')
  async updateRating(
    @Param('employeeId') employeeId: string,
    @Param('skillId') skillId: string,
    @Body() body: { rating: number },
  ) {
    return await this.employeeSkillsService.updateRating(
      +employeeId,
      +skillId,
      body.rating,
    );
  }

  @Roles('admin', 'manager')
  @Permissions('employee:update')
  @Delete(':skillId')
  async removeSkill(
    @Param('employeeId') employeeId: string,
    @Param('skillId') skillId: string,
  ) {
    await this.employeeSkillsService.removeSkillFromEmployee(
      +employeeId,
      +skillId,
    );
    return { message: 'Skill removed from employee successfully' };
  }
}
