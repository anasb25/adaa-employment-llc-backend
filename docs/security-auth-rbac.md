# Security, authentication & RBAC

## JWT authentication

### Flow

1. User authenticates via [`POST /api/auth/login`](./http-api-reference.md) (or invitation registration flows).
2. [`AuthService`](../src/modules/auth/auth.service.ts) validates credentials and issues **access** and **refresh** tokens via `JwtService`, using secrets and expiry values from [`auth.config.ts`](../src/config/auth.config.ts).
3. [`JwtStrategy`](../src/modules/auth/strategies/jwt.strategy.ts) reads `Bearer` tokens, verifies with `jwtSecret`, and resolves `payload.sub` to an active **`User`** (with role and permissions eagerly loaded).

### JWT payload shape (access / refresh pairing)

Emitted in `generateTokens` ([`auth.service.ts`](../src/modules/auth/auth.service.ts)):

- `sub` — user primary key
- `email`
- `role` — string role name (`user.role?.name`)
- `permissions` — string array (`user.role.permissions[].name`)

### Password reset auxiliary tokens

Separate short-lived JWTs include `type: 'password_reset'` and `email` for reset-password validation.

---

## Public routes

The [`@Public()`](../src/common/decorators/public.decorator.ts) metadata is read inside [`JwtAuthGuard`](../src/common/guards/jwt-auth.guard.ts) via `Reflector`; when set, JWT validation is skipped.

Examples:

- All [`AuthController`](../src/modules/auth/auth.controller.ts) auth endpoints except `me` and `change-password`
- Invite validation and signup paths on [`InvitationController`](../src/modules/invitations/invitation.controller.ts)

---

## Roles and permissions entities

The database model (see migrations under [`src/database/migrations/`](./database-and-migrations.md)) uses:

| Concept | Purpose |
|---------|---------|
| **Role** | Named role (`admin`, `manager`, …) |
| **Permission** | Atom like `payroll:read`, `global:all` |
| Junction | Roles ↔ Permissions many-to-many |
| **User.roleId** | Each user assigns exactly one Role |

Historical documentation that described migrating off inline string roles still applies conceptually; see seed/migration scripts for actual default rows created in each environment.

### Wildcards (intent)

When **`PermissionsGuard`** is enabled, wildcard checks mirror this design intent:

1. Exact permission match
2. `${resource}:all` for scoped resources (`user`, `role`, …)
3. **`global:all`** super-wildcard

---

## Guards: current enforcement status

[`RolesGuard` and `PermissionsGuard`](../src/common/guards/authorization.guard.ts) are registered globally in [`app.module.ts`](../src/app.module.ts), but **`canActivate` currently returns `true` unconditionally**, with reference logic commented inline.

**Operational consequence:** decorators such as `@Roles('admin','manager')` and `@Permissions('payroll:read')` are **documentation-only** unless you restore enforcement in [`authorization.guard.ts`](../src/common/guards/authorization.guard.ts).

**Recommendation before production:** uncomment and test RBAC guards, add integration tests for forbidden cases, ensure every sensitive route has `@Permissions`/`@Roles` as needed.

---

## Cross-cutting interceptors

[`ActivityTrackingInterceptor`](../src/common/interceptors/activity-tracking.interceptor.ts) asynchronously updates **`users.lastActivity`** after handlers complete whenever `request.user` exists — failures log to stderr but **do not** fail the HTTP response.

---

## Transport security expectations

Production deployments should terminate TLS at a reverse proxy or platform ingress, isolate database credentials via secrets managers, rotate JWT secrets, and avoid shipping default secrets from [`auth.config.ts`](../src/config/auth.config.ts).

---

## RBAC HTTP surface (catalogue)

Controllers under **`/api/roles`**, **`/api/permissions`**, and parts of **`/api/users`** manage the RBAC graph. Representative routes (see [`http-api-reference.md`](./http-api-reference.md) for the full list):

- **Roles:** list/get/create/update/delete; `POST /api/roles/:id/permissions` assigns permission IDs to a role.
- **Permissions:** list/get/create/update/delete; `POST /api/permissions/bulk` mass-creates definitions.
- **Users:** `POST /api/users/:id/role` assigns a role; `GET /api/users/:id/permissions` surfaces effective permission names through the ORM graph.

### Intended default role layout (typical seed / migration)

| Role | Typical permission grant |
|------|---------------------------|
| `admin` | `global:all` |
| `manager` | `user:all` (or equivalent manager bundle) |
| `user` | `user:read` |

### Common permission name patterns

- **User:** `user:create`, `user:read`, `user:update`, `user:delete`, `user:assign-roles`, `user:all`
- **Role:** `role:create`, `role:read`, `role:update`, `role:delete`, `role:assign-permissions`, `role:all`
- **Permission resource:** `permission:create`, `permission:read`, `permission:update`, `permission:delete`, `permission:all`
- **Wildcards:** `{resource}:all`, `global:all`

Exact rows depend on executed migrations and any custom seeds in your environment.
