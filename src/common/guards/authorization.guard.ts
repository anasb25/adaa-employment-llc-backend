import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // DISABLED: Role guard temporarily disabled
    return true;

    // const requiredRoles = this.reflector.getAllAndOverride<string[]>(
    //   ROLES_KEY,
    //   [context.getHandler(), context.getClass()],
    // );

    // if (!requiredRoles) {
    //   return true;
    // }

    // const { user }: { user: User } = context.switchToHttp().getRequest();

    // if (!user) {
    //   throw new ForbiddenException('User not authenticated');
    // }

    // const hasRole = requiredRoles.some((role) => user.role?.name === role);

    // if (!hasRole) {
    //   throw new ForbiddenException(
    //     `Access denied. Required roles: ${requiredRoles.join(', ')}`,
    //   );
    // }

    // return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // DISABLED: Permissions guard temporarily disabled
    return true;

    // const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
    //   PERMISSIONS_KEY,
    //   [context.getHandler(), context.getClass()],
    // );

    // if (!requiredPermissions) {
    //   return true;
    // }

    // const { user }: { user: User } = context.switchToHttp().getRequest();

    // if (!user) {
    //   throw new ForbiddenException('User not authenticated');
    // }

    // const userPermissions = user.role?.permissions?.map((p) => p.name) || [];

    // // Check for wildcard permissions and specific permissions
    // const hasPermission = requiredPermissions.some((requiredPermission) => {
    //   // Check for exact match
    //   if (userPermissions.includes(requiredPermission)) {
    //     return true;
    //   }

    //   // Check for wildcard permissions
    //   const permissionParts = requiredPermission.split(':');
    //   if (permissionParts.length >= 2) {
    //     const resource = permissionParts[0];
    //     const action = permissionParts[1];

    //     // Check for resource:all permission
    //     if (userPermissions.includes(`${resource}:all`)) {
    //       return true;
    //     }

    //     // Check for global:all permission
    //     if (userPermissions.includes('global:all')) {
    //       return true;
    //     }
    //   }

    //   return false;
    // });

    // if (!hasPermission) {
    //   throw new ForbiddenException(
    //     `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
    //   );
    // }

    // return true;
  }
}
