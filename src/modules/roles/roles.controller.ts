import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Roles('admin')
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Roles('admin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(+id);
  }

  @Roles('admin')
  @Permissions('role:create')
  @Post()
  create(@Body() createRoleDto: Partial<Role>) {
    return this.rolesService.create(createRoleDto);
  }

  @Roles('admin')
  @Permissions('role:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() updateRoleDto: Partial<Role>) {
    return this.rolesService.update(+id, updateRoleDto);
  }

  @Roles('admin')
  @Permissions('role:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesService.remove(+id);
  }

  @Roles('admin')
  @Permissions('role:assign-permissions')
  @Post(':id/permissions')
  assignPermissions(
    @Param('id') id: string,
    @Body() body: { permissionIds: number[] },
  ) {
    return this.rolesService.assignPermissions(+id, body.permissionIds);
  }
}
