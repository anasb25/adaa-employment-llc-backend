# @rovinghut/nestjs-auth Implementation Guide

This document explains the complete implementation of `@rovinghut/nestjs-auth` in the Adaa Employment LLC Backend.

## Architecture Overview

The authentication system is fully integrated with:

- **NestJS ConfigModule** for environment configuration
- **TypeORM** for database entities with audit columns
- **Custom decorators** for extracting current user
- **Role-based and permission-based access control**

## Directory Structure

```
src/
├── config/
│   ├── app.config.ts           # Application configuration
│   ├── auth.config.ts          # Auth service URLs configuration
│   └── database.config.ts      # Database configuration
├── common/
│   ├── entities/
│   │   ├── base.entity.ts      # Base entity with audit columns
│   │   └── index.ts
│   └── decorators/
│       ├── current-user.decorator.ts  # @CurrentUser() decorator
│       └── index.ts
├── modules/
│   ├── users/
│   │   ├── entities/
│   │   │   └── user.entity.ts  # User entity extending BaseEntity
│   │   ├── users.controller.ts # User management with role guards
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   └── resources/
│       ├── resources.controller.ts # Examples of all guard types
│       └── resources.module.ts
├── app.module.ts               # Main module with all configurations
├── main.ts                     # Bootstrap with global prefix & CORS
└── protected.controller.ts     # Simple protected route example
```

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=adaa_employment

# Auth Service URLs
TOKEN_INTROSPECTION_URL=http://localhost:3001/auth/introspect
PERMISSION_CHECK_URL=http://localhost:3001/auth/check-permission
ROLE_CHECK_URL=http://localhost:3001/auth/check-role

# Application Configuration
NODE_ENV=development
PORT=3000
```

### Configuration Files

#### `src/config/auth.config.ts`

Exports auth service URLs for token validation, permission checks, and role checks.

#### `src/config/database.config.ts`

Exports database connection configuration.

#### `src/config/app.config.ts`

Exports application-level configuration (port, environment).

## Base Entity

All entities extend `BaseEntity` which provides:

```typescript
@PrimaryGeneratedColumn()
id: number;

@CreateDateColumn()
createdAt: Date;

@Column({ nullable: true })
createdBy: number;

@UpdateDateColumn()
updatedAt: Date;

@Column({ nullable: true })
updatedBy: number;

@DeleteDateColumn({ nullable: true })
deletedAt: Date;

@Column({ nullable: true })
deletedBy: number;
```

This enables automatic audit tracking for all entities.

## Auth Module Integration

The `NestJSAuthModule` is registered globally in `AppModule`:

```typescript
NestJSAuthModule.forRoot();
```

This provides:

- `AuthGuard` - JWT token validation
- `PermissionGuard` - Permission-based access control
- `RoleGuard` - Role-based access control
- `AuthValidatorService` - Token validation service
- `TokenExtractorService` - Token extraction from requests

## Custom Decorators

### `@CurrentUser()`

Extracts the authenticated user from the request:

```typescript
@Get('me')
@Auth()
getCurrentUser(@CurrentUser() user: User) {
  return user;
}
```

## Guard Usage Examples

### 1. Basic Authentication

Requires a valid JWT token:

```typescript
@Get('authenticated')
@Auth()
getAuthenticated(@CurrentUser() user: User) {
  return { message: 'Authenticated!', user };
}
```

### 2. Role-Based Access Control

#### Single Role Required

```typescript
@Get('admin')
@RequireRoles(['admin'])
getAdminResource() {
  return { message: 'Admin only' };
}
```

#### Any of Multiple Roles

```typescript
@Get('moderator')
@RequireRoles(['admin', 'moderator'], 'any')
getModeratorResource() {
  return { message: 'Admin OR Moderator' };
}
```

#### All Roles Required

```typescript
@Get('multi-role')
@RequireRoles(['admin', 'manager'], 'all')
getMultiRoleResource() {
  return { message: 'Admin AND Manager' };
}
```

### 3. Permission-Based Access Control

#### Single Permission

```typescript
@Get('read-only')
@RequirePermissions(['resource.read'])
getReadOnlyResource() {
  return { message: 'Read permission required' };
}
```

#### Any of Multiple Permissions

```typescript
@Post()
@RequirePermissions(['resource.create', 'resource.manage'], 'any')
createResource(@Body() data: any) {
  return { message: 'Create OR Manage permission' };
}
```

#### All Permissions Required

```typescript
@Put(':id')
@RequirePermissions(['resource.update', 'resource.manage'], 'all')
updateResource(@Param('id') id: string, @Body() data: any) {
  return { message: 'Update AND Manage permissions' };
}
```

### 4. Complex Authorization

Combine multiple guards:

```typescript
@Get('complex')
@RequireRoles(['admin'], 'any')
@RequirePermissions(['resource.manage'], 'any')
getComplexResource() {
  return { message: 'Admin role OR resource.manage permission' };
}
```

## API Endpoints

### Public Endpoints

- `GET /api` - Hello world
- `GET /api/health` - Health check
- `GET /api/resources/public` - Public resource

### Protected Endpoints (Require Authentication)

- `GET /api/protected` - Basic protected route
- `GET /api/resources/authenticated` - Authenticated resource
- `GET /api/users/me` - Current user info

### Role-Protected Endpoints

- `GET /api/users` - List users (admin/manager)
- `POST /api/users` - Create user (admin)
- `PUT /api/users/:id` - Update user (admin)
- `DELETE /api/users/:id` - Delete user (admin)
- `GET /api/resources/admin` - Admin only
- `GET /api/resources/moderator` - Admin or Moderator
- `GET /api/resources/multi-role` - Admin AND Manager

### Permission-Protected Endpoints

- `GET /api/resources/read-only` - Requires `resource.read`
- `POST /api/resources` - Requires `resource.create` OR `resource.manage`
- `PUT /api/resources/:id` - Requires `resource.update` AND `resource.manage`
- `DELETE /api/resources/:id` - Requires `resource.delete`

## Request Headers

### Authentication Header

```
Authorization: Bearer <jwt_token>
```

Or use cookie:

```
Cookie: access_token=<jwt_token>
```

### Context Headers (for Permission/Role checks)

```
x-org-id: <organization-id>         (required)
x-workspace-id: <workspace-id>      (optional)
x-object-id: <object-id>            (optional)
```

## User Entity

The `User` entity extends `BaseEntity` and includes:

```typescript
@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: 'user' })
  role: string;

  @Column('simple-array', { nullable: true })
  permissions: string[];

  @Column({ default: true })
  isActive: boolean;
}
```

## Database Setup

1. Ensure PostgreSQL is running
2. Create the database:
   ```sql
   CREATE DATABASE adaa_employment;
   ```
3. Update `.env` with your database credentials
4. Run the application - TypeORM will auto-sync tables in development mode

## Running the Application

```bash
# Install dependencies
npm install

# Development mode
npm run start:dev

# Production build
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000/api`

## Testing Auth

### 1. Test Public Endpoint

```bash
curl http://localhost:3000/api/resources/public
```

### 2. Test Protected Endpoint (will fail without token)

```bash
curl http://localhost:3000/api/protected
# Returns 401 Unauthorized
```

### 3. Test with Valid Token

```bash
curl http://localhost:3000/api/protected \
  -H "Authorization: Bearer <your_jwt_token>"
```

### 4. Test Role-Based Access

```bash
curl http://localhost:3000/api/resources/admin \
  -H "Authorization: Bearer <admin_token>"
```

### 5. Test Permission-Based Access

```bash
curl http://localhost:3000/api/resources/read-only \
  -H "Authorization: Bearer <token>" \
  -H "x-org-id: org_123"
```

## Error Responses

### 401 Unauthorized

Returned when:

- No token provided
- Invalid token
- Token expired

### 403 Forbidden

Returned when:

- User lacks required role(s)
- User lacks required permission(s)

### 400 Bad Request

Returned when:

- Required headers missing (e.g., `x-org-id` for permission checks)

### 503 Service Unavailable

Returned when:

- Auth service is unavailable
- Cannot reach introspection/permission/role check endpoints

## Best Practices

1. **Use `@Auth()` decorator** for simple authentication checks
2. **Use `@RequireRoles()`** for role-based access control
3. **Use `@RequirePermissions()`** for fine-grained permission control
4. **Always use `@CurrentUser()`** to access authenticated user data
5. **Provide context headers** (`x-org-id`, etc.) for permission/role checks
6. **Configure proper auth service URLs** in environment variables
7. **Use BaseEntity** for all entities to track audit information
8. **Enable CORS** appropriately for your frontend

## Troubleshooting

### Issue: "Cannot connect to database"

- Check PostgreSQL is running
- Verify database credentials in `.env`
- Ensure database exists

### Issue: "Token validation failed"

- Verify `TOKEN_INTROSPECTION_URL` is correct
- Check auth service is running
- Validate token format

### Issue: "Permission check failed"

- Ensure `x-org-id` header is provided
- Verify `PERMISSION_CHECK_URL` is correct
- Check user has required permissions in auth service

### Issue: "Module resolution errors"

- Ensure all `.js` extensions are present in imports (NodeNext module resolution)
- Run `npm install` to ensure all dependencies are installed

## Additional Resources

- [@rovinghut/nestjs-auth Documentation](https://github.com/rovinghut/nestjs-auth)
- [NestJS Guards Documentation](https://docs.nestjs.com/guards)
- [TypeORM Documentation](https://typeorm.io/)
