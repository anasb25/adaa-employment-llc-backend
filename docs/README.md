# ADAA Employment LLC Backend — Documentation

This folder contains the canonical documentation for the `adaa-employment-llc-backend` NestJS application. There is **no** Markdown `README` at the repository root — start here.

## Contents

| Document | Description |
|----------|--------------|
| [Getting started](./getting-started.md) | Prerequisites, installation, npm scripts, local run |
| [Architecture](./architecture.md) | Bootsrap, layers, guards, interceptors, module map |
| [Configuration & environment](./configuration.md) | Environment variables and config namespaces |
| [Database & migrations](./database-and-migrations.md) | PostgreSQL, TypeORM, migrations, entity layout |
| [Data model](./data-model.md) | Entity inventory and relationships at a glance |
| [HTTP API reference](./http-api-reference.md) | Routes grouped by feature (`/api` prefix) |
| [Security, authentication & RBAC](./security-auth-rbac.md) | JWT, public routes, roles/permissions model |
| [Timesheets](./timesheets.md) | Monthly workflow, entries, approvals, mobilization sync |
| [Payroll & related finance](./payroll-invoices-settlements.md) | Payroll generation, PDFs, invoices, settlements |
| [Operations](./operations.md) | Scheduled jobs, email, assets, troubleshooting |

## API base URL

All HTTP routes use the global prefix **`/api`** (except the root smoke endpoints on the app controller).

Example: `http://localhost:3000/api/auth/login`.

## Tech stack

- **Runtime:** Node.js
- **Framework:** NestJS 11
- **ORM:** TypeORM 0.3 with PostgreSQL
- **Auth:** Passport JWT, bcrypt
- **Scheduling:** `@nestjs/schedule`
- **Excel:** `xlsx`
- **PDF (HTML rendering):** Puppeteer (via payroll/invoice pipelines)
