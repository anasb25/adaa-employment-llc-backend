import { Permission } from '../../modules/permissions/entities/permission.entity';
import { isSuperAdminRole } from './super-admin.util';

type PermissionHolder = {
  role?: { name?: string | null; permissions?: Permission[] | null } | null;
};

/** Admin menu (User / Role / Permission management) — never granted by global:all alone. */
const ADMIN_MENU_RESOURCES = new Set(['user', 'role', 'permission']);

/** Authorization uses the assigned role's permissions (Role Management is the source of truth). */
export function getRolePermissions(
  user?: PermissionHolder | null,
): Permission[] {
  return user?.role?.permissions ?? [];
}

export function userHasPermission(
  user: PermissionHolder | null | undefined,
  permission: string,
): boolean {
  if (isSuperAdminRole(user?.role)) {
    return true;
  }

  const names = getRolePermissions(user).map((p) => p.name);
  if (names.includes(permission)) {
    return true;
  }

  const resource = permission.split(':')[0] || '';

  if (resource && names.includes(`${resource}:all`)) {
    return true;
  }

  // global:all covers the rest of the app (employees, payroll, etc.), not Admin menu RBAC.
  if (
    names.includes('global:all') &&
    resource &&
    !ADMIN_MENU_RESOURCES.has(resource)
  ) {
    return true;
  }

  return false;
}
