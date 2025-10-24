import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Roles('admin')
  @Get()
  findAll() {
    return this.permissionsService.findAll();
  }

  @Roles('admin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(+id);
  }

  @Roles('admin')
  @Permissions('permission:create')
  @Post()
  create(@Body() createPermissionDto: Partial<Permission>) {
    return this.permissionsService.create(createPermissionDto);
  }

  @Roles('admin')
  @Permissions('permission:update')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: Partial<Permission>,
  ) {
    return this.permissionsService.update(+id, updatePermissionDto);
  }

  @Roles('admin')
  @Permissions('permission:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(+id);
  }

  @Roles('admin')
  @Permissions('permission:create')
  @Post('bulk')
  createMultiple(@Body() body: { permissions: Partial<Permission>[] }) {
    return this.permissionsService.createMultiple(body.permissions);
  }
}
