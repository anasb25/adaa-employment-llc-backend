import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { Auth, RequireRoles } from '@rovinghut/nestjs-auth';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { User as AuthUser } from '@rovinghut/nestjs-auth';

@Controller('users')
@Auth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthUser) {
    return {
      sub: user.sub,
      role: user.role,
      permissions: user.permissions,
    };
  }

  @Get()
  @RequireRoles(['admin', 'manager'], 'any')
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<User | null> {
    return this.usersService.findOne(+id);
  }

  @Post()
  @RequireRoles(['admin'])
  create(@Body() userData: Partial<User>): Promise<User> {
    return this.usersService.create(userData);
  }

  @Put(':id')
  @RequireRoles(['admin'])
  update(
    @Param('id') id: string,
    @Body() userData: Partial<User>,
  ): Promise<User> {
    return this.usersService.update(+id, userData);
  }

  @Delete(':id')
  @RequireRoles(['admin'])
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(+id);
  }
}
