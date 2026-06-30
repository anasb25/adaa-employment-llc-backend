# HTTP API reference

Base path prefix: **`/api`**.

Unless noted, endpoints expect **`Authorization: Bearer <access_token>`** (global `JwtAuthGuard`). Routes decorated with **`@Public()`** do not require a token ([`JwtAuthGuard`](../src/common/guards/jwt-auth.guard.ts)).

Detailed request/response bodies are defined in each module’s DTO classes under [`src/modules/*/dto/`](../src/modules).

---

## App

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api` | Smoke / hello (`AppController`) |
| GET | `/api/health` | `{ status, timestamp, service }` |

---

## Auth (`/api/auth`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/refresh` | Public |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public |
| POST | `/api/auth/register-with-invitation` | Public |
| GET | `/api/auth/me` | JWT |
| POST | `/api/auth/change-password` | JWT |

---

## Invitations (`/api/invitations`)

Controller-wide `JwtAuthGuard`; some routes `@Public()`:

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/invitations` | JWT |
| POST | `/api/invitations/accept` | Public |
| GET | `/api/invitations/validate/:token` | Public |
| POST | `/api/invitations/complete-signup` | Public |
| GET | `/api/invitations/my-invitations` | JWT |
| PATCH | `/api/invitations/:id/cancel` | JWT |
| POST | `/api/invitations/:id/resend` | JWT |

---

## Users (`/api/users`)

| Method | Path |
|--------|------|
| GET | `/api/users/profile` |
| GET | `/api/users` |
| POST | `/api/users` |
| GET | `/api/users/actions/search` |
| GET | `/api/users/:id` |
| PUT | `/api/users/:id/status` |
| DELETE | `/api/users/:id` |
| POST | `/api/users/:id/role` |
| GET | `/api/users/:id/permissions` |

*(Route order matters in NestJS: static segments like `profile`/`actions/search` appear before parameterized `:id` in the controller file.)*

---

## Roles (`/api/roles`)

| Method | Path |
|--------|------|
| GET | `/api/roles` |
| GET | `/api/roles/:id` |
| POST | `/api/roles` |
| PUT | `/api/roles/:id` |
| DELETE | `/api/roles/:id` |
| POST | `/api/roles/:id/permissions` |

---

## Permissions (`/api/permissions`)

| Method | Path |
|--------|------|
| GET | `/api/permissions` |
| GET | `/api/permissions/:id` |
| POST | `/api/permissions` |
| PUT | `/api/permissions/:id` |
| DELETE | `/api/permissions/:id` |
| POST | `/api/permissions/bulk` |

---

## Employees (`/api/employees`)

| Method | Path |
|--------|------|
| GET | `/api/employees` |
| GET | `/api/employees/actions/export` |
| GET | `/api/employees/actions/import-template` |
| POST | `/api/employees/actions/import` |
| GET | `/api/employees/actions/search` |
| GET | `/api/employees/actions/with-timesheet-status` |
| GET | `/api/employees/:id` |
| POST | `/api/employees` |
| PUT | `/api/employees/:id` |
| POST | `/api/employees/actions/delete-many` |
| DELETE | `/api/employees/:id` |
| POST | `/api/employees/:id/actions/decrement-air-ticket` |

---

## Skills (`/api/skills`)

| Method | Path |
|--------|------|
| GET | `/api/skills` |
| GET | `/api/skills/actions/search` |
| GET | `/api/skills/:id` |
| POST | `/api/skills` |
| PUT | `/api/skills/:id` |
| DELETE | `/api/skills/:id` |

## Skill types (`/api/skill-types`)

| Method | Path |
|--------|------|
| GET | `/api/skill-types` |
| POST | `/api/skill-types` |
| PUT | `/api/skill-types/:id` |
| DELETE | `/api/skill-types/:id` |

---

## Employee skills (`/api/employees/:employeeId/skills`)

| Method | Path |
|--------|------|
| GET | `/api/employees/:employeeId/skills` |
| POST | `/api/employees/:employeeId/skills` |
| PUT | `/api/employees/:employeeId/skills/:skillId/rating` |
| DELETE | `/api/employees/:employeeId/skills/:skillId` |

---

## Clients (`/api/clients`)

| Method | Path |
|--------|------|
| GET | `/api/clients` |
| GET | `/api/clients/actions/search` |
| GET | `/api/clients/:id` |
| POST | `/api/clients` |
| PUT | `/api/clients/:id` |
| POST | `/api/clients/actions/delete-many` |
| DELETE | `/api/clients/:id` |

---

## Projects (`/api/projects`)

| Method | Path |
|--------|------|
| GET | `/api/projects` |
| GET | `/api/projects/actions/search` |
| GET | `/api/projects/:id` |
| POST | `/api/projects` |
| PUT | `/api/projects/:id` |
| POST | `/api/projects/actions/delete-many` |
| DELETE | `/api/projects/:id` |

---

## Project skills (`/api/projects/:projectId/skills`)

| Method | Path |
|--------|------|
| GET | `/api/projects/:projectId/skills` |
| POST | `/api/projects/:projectId/skills` |
| PUT | `/api/projects/:projectId/skills/:skillId` |
| DELETE | `/api/projects/:projectId/skills/:skillId` |

---

## Mobilizations (`/api/mobilizations`)

| Method | Path |
|--------|------|
| POST | `/api/mobilizations` |
| POST | `/api/mobilizations/bulk` |
| GET | `/api/mobilizations` |
| GET | `/api/mobilizations/statistics` |
| GET | `/api/mobilizations/current-status` |
| GET | `/api/mobilizations/effective-status-on-date` |
| GET | `/api/mobilizations/employee/:employeeId/latest` |
| GET | `/api/mobilizations/employee/:employeeId/status-on-date` |
| GET | `/api/mobilizations/employee/:employeeId/history` |
| GET | `/api/mobilizations/project/:projectId/employees` |
| GET | `/api/mobilizations/actions/export` |
| GET | `/api/mobilizations/actions/import-template` |
| POST | `/api/mobilizations/actions/import` |
| GET | `/api/mobilizations/:id` |
| PATCH | `/api/mobilizations/:id` |
| POST | `/api/mobilizations/actions/delete-many` |
| DELETE | `/api/mobilizations/:id` |

---

## Timesheets (`/api/timesheets`)

See [Timesheets](./timesheets.md) for workflow semantics.

| Method | Path |
|--------|------|
| GET | `/api/timesheets/daily-utilization` |
| GET | `/api/timesheets/all-projects/month/:month` |
| GET | `/api/timesheets/project/:projectId/month/:month` |
| POST | `/api/timesheets` |
| PUT | `/api/timesheets/:id/entries` |
| POST | `/api/timesheets/:id/submit` |
| POST | `/api/timesheets/:id/approve` |
| POST | `/api/timesheets/entries/:entryId/sync-to-mobilization` |
| POST | `/api/timesheets/entries/:entryId/sync-from-mobilization` |
| GET | `/api/timesheets` |
| GET | `/api/timesheets/:id` |
| DELETE | `/api/timesheets/:id` |

---

## Special days (`/api/special-days`)

| Method | Path |
|--------|------|
| POST | `/api/special-days` |
| GET | `/api/special-days` |
| GET | `/api/special-days/:id` |
| PATCH | `/api/special-days/:id` |
| DELETE | `/api/special-days/:id` |
| GET | `/api/special-days/check/:date` |
| GET | `/api/special-days/range/:startDate/:endDate` |
| GET | `/api/special-days/rates` |
| GET | `/api/special-days/rates/range` |

---

## Rate variants (`/api/rate-variants`)

| Method | Path |
|--------|------|
| POST | `/api/rate-variants` |
| GET | `/api/rate-variants` |
| GET | `/api/rate-variants/:id` |
| PATCH | `/api/rate-variants/:id` |
| DELETE | `/api/rate-variants/:id` |

---

## Payroll (`/api/payroll`)

`@Permissions(...)` decorators are present on handlers; enforcement depends on guards being active ([Security](./security-auth-rbac.md)).

| Method | Path |
|--------|------|
| GET | `/api/payroll` |
| GET | `/api/payroll/month/:month` |
| GET | `/api/payroll/check/:employeeId/:month` |
| GET | `/api/payroll/:id/pdf` |
| GET | `/api/payroll/:id` |
| POST | `/api/payroll` |
| POST | `/api/payroll/upsert` |
| POST | `/api/payroll/bulk` |
| PUT | `/api/payroll/:id` |
| POST | `/api/payroll/actions/delete-many` |
| DELETE | `/api/payroll/:id` |
| POST | `/api/payroll/calculate/month/:month` |
| POST | `/api/payroll/calculate/project/:projectId/month/:month` |
| POST | `/api/payroll/import-allowances-deductions/:month` *(multipart upload)* |
| GET | `/api/payroll/template/allowances-deductions` |

---

## Invoices (`/api/invoices`)

| Method | Path |
|--------|------|
| GET | `/api/invoices` |
| GET | `/api/invoices/:id` |
| POST | `/api/invoices/generate` |
| PATCH | `/api/invoices/:id` |
| POST | `/api/invoices/:id/approve` |
| POST | `/api/invoices/:id/send` |
| POST | `/api/invoices/:id/paid` |
| POST | `/api/invoices/actions/delete-many` |
| DELETE | `/api/invoices/:id` |
| GET | `/api/invoices/:id/pdf` |

---

## Settlements (`/api/settlements`)

| Method | Path |
|--------|------|
| GET | `/api/settlements` |
| GET | `/api/settlements/actions/search` |
| GET | `/api/settlements/actions/calculate-gratuity/:employeeId` |
| GET | `/api/settlements/employee/:employeeId` |
| GET | `/api/settlements/:id` |
| POST | `/api/settlements` |
| PUT | `/api/settlements/:id` |
| POST | `/api/settlements/actions/delete-many` |
| DELETE | `/api/settlements/:id` |
| POST | `/api/settlements/:id/approve` |
| POST | `/api/settlements/:id/mark-paid` |
| GET | `/api/settlements/:id/excel` |

---

## Dashboard (`/api/dashboard`)

| Method | Path |
|--------|------|
| GET | `/api/dashboard/expiring-documents` |
