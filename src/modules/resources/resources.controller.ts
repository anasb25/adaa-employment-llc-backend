import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { Auth, RequireRoles, RequirePermissions } from '@rovinghut/nestjs-auth';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { User } from '@rovinghut/nestjs-auth';

@Controller('resources')
export class ResourcesController {
  // Public endpoint - no authentication required
  @Get('public')
  getPublic() {
    return { message: 'This is a public resource' };
  }

  // Requires authentication only
  @Get('authenticated')
  @Auth()
  getAuthenticated(@CurrentUser() user: User) {
    return {
      message: 'This is an authenticated resource',
      user: {
        sub: user.sub,
        role: user.role,
      },
    };
  }

  // Requires admin role
  @Get('admin')
  @RequireRoles(['admin'])
  getAdminResource(@CurrentUser() user: User) {
    return {
      message: 'Admin-only resource',
      user: { sub: user.sub, role: user.role },
    };
  }

  // Requires any of the specified roles
  @Get('moderator')
  @RequireRoles(['admin', 'moderator'], 'any')
  getModeratorResource(@CurrentUser() user: User) {
    return {
      message: 'Moderator or Admin resource',
      user: { sub: user.sub, role: user.role },
    };
  }

  // Requires all specified roles
  @Get('multi-role')
  @RequireRoles(['admin', 'manager'], 'all')
  getMultiRoleResource(@CurrentUser() user: User) {
    return {
      message: 'Requires both admin AND manager roles',
      user: { sub: user.sub, role: user.role },
    };
  }

  // Requires specific permission
  @Get('read-only')
  @RequirePermissions(['resource.read'])
  getReadOnlyResource(@CurrentUser() user: User) {
    return {
      message: 'Read permission required',
      user: { sub: user.sub, permissions: user.permissions },
    };
  }

  // Requires any of the specified permissions
  @Post()
  @RequirePermissions(['resource.create', 'resource.manage'], 'any')
  createResource(@Body() data: any, @CurrentUser() user: User) {
    return {
      message: 'Resource created',
      data,
      createdBy: user.sub,
    };
  }

  // Requires all specified permissions
  @Put(':id')
  @RequirePermissions(['resource.update', 'resource.manage'], 'all')
  updateResource(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser() user: User,
  ) {
    return {
      message: 'Resource updated',
      id,
      data,
      updatedBy: user.sub,
    };
  }

  // Requires delete permission
  @Delete(':id')
  @RequirePermissions(['resource.delete'])
  deleteResource(@Param('id') id: string, @CurrentUser() user: User) {
    return {
      message: 'Resource deleted',
      id,
      deletedBy: user.sub,
    };
  }

  // Complex example: admin role OR specific permissions
  @Get('complex')
  @RequireRoles(['admin'], 'any')
  @RequirePermissions(['resource.manage'], 'any')
  getComplexResource(@CurrentUser() user: User) {
    return {
      message:
        'Complex authorization - requires admin role OR resource.manage permission',
      user: {
        sub: user.sub,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }
}
