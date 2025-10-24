# Role-Based Access Control (RBAC) System

This document describes the implementation of a role-based access control system in the ADAA Employment LLC backend.

## Overview

The system has been updated to use a proper role-based access control (RBAC) model instead of the previous simple role string and permissions array approach. This provides better scalability, maintainability, and security.

## Architecture

### Entities

1. **User Entity** (`src/modules/users/entities/user.entity.ts`)
   - Removed: `role` (string) and `permissions` (string array)
   - Added: `roleId` (foreign key) and `role` (ManyToOne relationship with Role entity)
   - **Note**: Each user can have only **one role**

2. **Role Entity** (`src/modules/roles/entities/role.entity.ts`)
   - `name`: Unique role name (e.g., 'admin', 'manager', 'user')
   - `description`: Human-readable description
   - `isActive`: Whether the role is active
   - `permissions`: ManyToMany relationship with Permission entity
   - `users`: OneToMany relationship with User entity

3. **Permission Entity** (`src/modules/permissions/entities/permission.entity.ts`)
   - `name`: Unique permission name (e.g., 'user:create', 'role:update', 'user:all', 'global:all')
   - `description`: Human-readable description
   - `isActive`: Whether the permission is active
   - `roles`: ManyToMany relationship with Role entity

### Database Structure

- `users` table: Contains user information with `roleId` foreign key
- `roles` table: Contains role definitions
- `permissions` table: Contains permission definitions
- `role_permissions` table: Junction table linking roles to permissions

## API Endpoints

### Roles

- `GET /roles` - List all roles (admin only)
- `GET /roles/:id` - Get role by ID (admin only)
- `POST /roles` - Create new role (admin only, requires 'role:create' permission)
- `PUT /roles/:id` - Update role (admin only, requires 'role:update' permission)
- `DELETE /roles/:id` - Delete role (admin only, requires 'role:delete' permission)
- `POST /roles/:id/permissions` - Assign permissions to role (admin only, requires 'role:assign-permissions' permission)

### Permissions

- `GET /permissions` - List all permissions (admin only)
- `GET /permissions/:id` - Get permission by ID (admin only)
- `POST /permissions` - Create new permission (admin only, requires 'permission:create' permission)
- `PUT /permissions/:id` - Update permission (admin only, requires 'permission:update' permission)
- `DELETE /permissions/:id` - Delete permission (admin only, requires 'permission:delete' permission)
- `POST /permissions/bulk` - Create multiple permissions (admin only, requires 'permission:create' permission)

### Users (Updated)

- `GET /users` - List all users (admin only)
- `GET /users/:id` - Get user by ID (admin/manager only)
- `POST /users` - Create new user (admin only, requires 'user:create' permission)
- `PUT /users/:id` - Update user (admin only, requires 'user:update' permission)
- `DELETE /users/:id` - Delete user (admin only, requires 'user:delete' permission)
- `POST /users/:id/role` - Assign role to user (admin only, requires 'user:assign-roles' permission)
- `GET /users/:id/permissions` - Get user's effective permissions (admin/manager only)

## Default Roles and Permissions

### Roles

1. **admin** - Administrator with full access
2. **manager** - Manager with limited administrative access
3. **user** - Regular user with basic access

### Permissions

- `user:create` - Create new users
- `user:read` - View user information
- `user:update` - Update user information
- `user:delete` - Delete users
- `user:assign-roles` - Assign roles to users
- `user:all` - All user permissions (wildcard)
- `role:create` - Create new roles
- `role:read` - View role information
- `role:update` - Update role information
- `role:delete` - Delete roles
- `role:assign-permissions` - Assign permissions to roles
- `role:all` - All role permissions (wildcard)
- `permission:create` - Create new permissions
- `permission:read` - View permission information
- `permission:update` - Update permission information
- `permission:delete` - Delete permissions
- `permission:all` - All permission permissions (wildcard)
- `global:all` - All permissions across all resources (super wildcard)

### Default Role-Permission Assignments

- **admin**: `global:all` (covers all permissions)
- **manager**: `user:all` (covers all user-related permissions)
- **user**: `user:read` (basic read access)

## JWT Token Changes

The JWT payload has been updated to include:

```typescript
{
  sub: number;        // User ID
  email: string;      // User email
  role: string;       // Single role name (replaces 'roles' array)
  permissions: string[]; // Array of effective permissions
}
```

## Wildcard Permissions

The system supports wildcard permissions that provide broader access without needing to specify individual permissions:

### Types of Wildcard Permissions

1. **Resource-level wildcards**: `{resource}:all`
   - `user:all` - Grants all user-related permissions
   - `role:all` - Grants all role-related permissions
   - `permission:all` - Grants all permission-related permissions

2. **Global wildcard**: `global:all`
   - Grants access to all permissions across all resources
   - Used for super admin roles

### How Wildcard Permissions Work

The permission guard checks for wildcard permissions in this order:

1. **Exact match**: Check if the user has the specific permission
2. **Resource wildcard**: Check if the user has `{resource}:all` permission
3. **Global wildcard**: Check if the user has `global:all` permission

### Examples

- User with `user:all` permission can access any endpoint requiring `user:create`, `user:read`, `user:update`, `user:delete`, etc.
- User with `global:all` permission can access any endpoint regardless of the required permission
- User with `user:read` permission can only access endpoints requiring `user:read`

## Migration

A database migration has been created (`1761219774751-AddRolesAndPermissions.ts`) that:

1. Creates the new tables (roles, permissions, role_permissions)
2. Adds roleId foreign key column to users table
3. Drops the old columns (role, permissions) from users table
4. Inserts default roles and permissions including wildcard permissions
5. Sets up the initial role-permission relationships using wildcard permissions

## Data Seeding

A seeding script is available at `src/scripts/seed-roles-permissions.ts` to populate the database with default roles and permissions.

## Usage Examples

### Assigning a Role to a User

```typescript
// Assign admin role to user
await usersService.assignRole(userId, adminRoleId);
```

### Getting User's Effective Permissions

```typescript
// Get all permissions a user has through their role
const permissions = await usersService.getUserPermissions(userId);
```

### Assigning Permissions to a Role

```typescript
// Assign specific permissions to a role
await rolesService.assignPermissions(roleId, [permissionId1, permissionId2]);
```

## Security Considerations

1. **Principle of Least Privilege**: Users should only be assigned the minimum roles necessary for their job function.

2. **Role Hierarchy**: Consider implementing role hierarchies where higher-level roles inherit permissions from lower-level roles.

3. **Permission Granularity**: Permissions are designed to be granular (e.g., 'user:read' vs 'user:create') to allow fine-grained access control.

4. **Audit Trail**: Consider adding audit logging for role and permission changes.

## Future Enhancements

1. **Role Hierarchies**: Implement role inheritance where roles can inherit permissions from other roles.
2. **Dynamic Permissions**: Add support for context-based permissions (e.g., user can only edit their own profile).
3. **Permission Groups**: Group related permissions together for easier management.
4. **Audit Logging**: Track all role and permission changes for security auditing.
5. **Role Templates**: Predefined role templates for common organizational structures.
