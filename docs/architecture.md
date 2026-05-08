# Architecture

## High-level picture

This service is a **modular NestJS monolith**:

- HTTP controllers live under [`src/modules/*`](../src/modules/).
- Persistence uses **TypeORM** entities declared next to each module and registered via glob in [`src/app.module.ts`](../src/app.module.ts): `entities: [__dirname + '/**/*.entity{.ts,.js}']`.
- **JWT authentication** gates most routes globally; **`@Public()`** opts out ([`JwtAuthGuard`](../src/common/guards/jwt-auth.guard.ts)).
- **Role** and **permission** metadata exists on controllers (`@Roles`, `@Permissions`), but the enforcing guards are presently short-circuited ([`authorization.guard.ts`](../src/common/guards/authorization.guard.ts)) — see [Security](./security-auth-rbac.md).

## Application bootstrap

[`src/main.ts`](../src/main.ts):

- Creates Nest app, reads `PORT` via `ConfigService`.
- Applies global `ValidationPipe` with `whitelist`, `transform`, and `enableImplicitConversion`.
- Enables CORS (`origin: true`, credentials).
- Sets global route prefix **`api`**.

[`src/app.module.ts`](../src/app.module.ts):

- Loads `@nestjs/config` with [`app.config`](../src/config/app.config.ts), [`database.config`](../src/config/database.config.ts), [`auth.config`](../src/config/auth.config.ts), [`mail.config`](../src/config/mail.config.ts).
- Registers `ScheduleModule` for cron jobs.
- Registers `TypeOrmModule.forRootAsync` (PostgreSQL, `synchronize: false`).
- Imports all feature modules (users, auth, invitations, RBAC entities, HR, projects, finance, dashboard, etc.).
- Registers **global** providers:
  - `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` (two latter currently no-op enforcement).
  - `ActivityTrackingInterceptor` — updates `User.lastActivity` after requests when `request.user` is present ([`activity-tracking.interceptor.ts`](../src/common/interceptors/activity-tracking.interceptor.ts)).

## Feature modules

| Module path | Responsibility |
|-------------|------------------|
| `auth` | Login, refresh, registration, password flows, JWT strategy |
| `users` | User CRUD-ish, profile, role assignment helpers |
| `roles` / `permissions` | RBAC catalogue and assignments |
| `invitations` | Email-based user invites and signup helpers |
| `employees` | Employee master data, import/export, search |
| `skills`, `skill-types` | Skill catalog |
| `employee-skills` | Employee–skill ratings under `employees/:employeeId/skills` |
| `clients` | Client companies |
| `projects` | Projects and lifecycle |
| `project-skills` | Required skills per project |
| `mobilizations` | Assignments/movements between idle and projects |
| `timesheets` | Monthly timesheets, entries, submit/approve, mobilization sync |
| `special-days` | Holidays / special dates and rate lookups |
| `rate-variants` | Rate variant definitions |
| `payroll` | Payroll CRUD, calculation from approved timesheets, PDF, Excel imports |
| `invoices` | Invoice generation through payment lifecycle, PDF |
| `settlements` | End-of-service settlements, approvals, Excel |
| `dashboard` | Aggregated snippets (e.g. expiring documents) |

Cross-cutting helpers include [`CronjobsService`](../src/shared/cronjobs.service.ts) ([Operations](./operations.md)) and [`EmailService`](../src/email/email.service.ts).

## JWT user on the request

The Passport JWT strategy validates the token and loads a full **`User`** via [`AuthService.validateUserById`](../src/modules/auth/auth.service.ts) with `role` and `role.permissions`. Controllers use `req.user`; the entity primary key is `id` (see [`User` entity](../src/modules/users/entities/user.entity.ts)).

## Shared base entity

Many tables extend [`BaseEntity`](../src/common/entities/base.entity.ts) for common audit timestamps and soft-delete fields where applicable — check individual entities for column usage.
