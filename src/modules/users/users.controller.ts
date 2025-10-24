import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  @Roles('admin')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles('admin', 'manager')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Roles('admin')
  @Permissions('user:create')
  @Post()
  create(@Body() createUserDto: any) {
    return this.usersService.create(createUserDto);
  }

  @Roles('admin')
  @Permissions('user:update')
  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: any) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Roles('admin')
  @Permissions('user:delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(Number(id));
  }

  @Roles('admin')
  @Permissions('user:assign-roles')
  @Post(':id/role')
  assignRole(@Param('id') id: string, @Body() body: { roleId: number }) {
    return this.usersService.assignRole(+id, body.roleId);
  }

  @Roles('admin', 'manager')
  @Get(':id/permissions')
  getUserPermissions(@Param('id') id: string) {
    return this.usersService.getUserPermissions(+id);
  }
}
