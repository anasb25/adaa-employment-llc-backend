# Database & migrations

## Stack

- **PostgreSQL**
- **TypeORM** (`synchronize: false` everywhere — schema changes go through migrations)

## Entities

Entities use the `*.entity.ts` naming convention and live alongside their modules, for example:

- [`src/modules/users/entities/user.entity.ts`](../src/modules/users/entities/user.entity.ts)
- [`src/modules/employees/entities/employee.entity.ts`](../src/modules/employees/entities/employee.entity.ts)
- [`src/modules/mobilizations/entities/mobilization.entity.ts`](../src/modules/mobilizations/entities/mobilization.entity.ts)
- [`src/modules/timesheets/entities/`](../src/modules/timesheets/entities/) (`timesheet`, `timesheet-entry`)
- Finance: [`payroll`](../src/modules/payroll/entities/payroll.entity.ts), [`invoice`](../src/modules/invoices/entities/invoice.entity.ts), [`settlement`](../src/modules/settlements/entities/settlement.entity.ts)

The runtime glob in [`src/app.module.ts`](../src/app.module.ts) loads all `*.entity.ts`/`*.js` under `src`.

## Migration data source

[`src/database/data-source.ts`](../src/database/data-source.ts) exports `AppDataSource` for TypeORM CLI:

- **Entities:** glob under `src`
- **Migrations:** [`src/database/migrations/`](../src/database/migrations/)
- **`synchronize: false`**
- **Logging:** enabled when `app.nodeEnv === 'development'` (see embedded `appConfig()` usage)

## npm scripts (authoritative names)

Defined in [`package.json`](../package.json):

| Script | Purpose |
|--------|---------|
| `npm run create-migration` | Create blank migration (`npm_config_name`, Windows-style `%npm_config_name%` pattern) |
| `npm run generate-migration` | Build then generate migration from entity diff (`-d src/database/data-source.ts`) |
| `npm run run-migrations` | Build then apply pending migrations |
| `npm run revert-migration` | Build then revert latest migration batch |
| `npm run show-migrations` | List migration status |

Example (POSIX shell) for naming a new blank migration via npm config flags may vary by platform; on Windows npm uses `%npm_config_name%` inline in package.json — follow your OS/npm docs or run `typeorm migration:create` with full path manually if needed.

**Always run migrations against the correct database**: same env vars as the running API.

## Auditing schema history

Historical RBAC rollout (roles, permissions, `users.roleId`, etc.) and later features (timesheets snapshots, mobilization normalization, air tickets history, idle nullable project linkage, invoice/payroll fields, etc.) are captured as timestamped migrations in [`src/database/migrations/`](../src/database/migrations/). Read filenames and generated SQL for chronological schema intent.
