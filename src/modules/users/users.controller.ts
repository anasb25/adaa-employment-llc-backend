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
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CurrentUser, Roles, Permissions } from '../../common/decorators';
import {
  PaginationUtil,
  PaginatedResponse,
} from '../../common/utils/pagination.util';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  @Roles('admin')
  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<User>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );
    return await this.usersService.findAllPaginated(paginationOptions);
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
  @Get('actions/search')
  async searchUsers(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedResponse<User>> {
    const paginationOptions = PaginationUtil.validatePaginationParams(
      page,
      limit,
    );

    return await this.usersService.searchUsers(query, paginationOptions);
  }

  @Roles('admin')
  @Permissions('user:update')
  @Put(':id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() currentUser: User,
  ) {
    // Prevent users from deactivating themselves
    if (+id === currentUser.id && !body.isActive) {
      throw new Error('You cannot deactivate your own account');
    }
    return await this.usersService.updateUserStatus(
      +id,
      body.isActive,
      currentUser.id,
    );
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
