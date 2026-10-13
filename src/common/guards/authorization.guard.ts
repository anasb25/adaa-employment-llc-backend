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
import { userHasPermission } from '../utils/permission-check.util';

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
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const { user }: { user: User } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const allowed = requiredPermissions.some((requiredPermission) =>
      userHasPermission(user, requiredPermission),
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
