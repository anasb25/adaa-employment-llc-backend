# Data model overview

PostgreSQL persists all domain aggregates. TypeORM **entity** classes map tables; filenames use the `*.entity.ts` suffix and are auto-discovered by Nest via glob in [`app.module.ts`](../src/app.module.ts).

This table names each entity file and its primary domain. For column-level detail, read the entity source and related migrations in [`src/database/migrations/`](../src/database/migrations/).

| Entity file | Module | Concise role |
|-------------|--------|----------------|
| [`base.entity.ts`](../src/common/entities/base.entity.ts) | Common | Shared primary key + audit/soft-delete columns consumed by other entities |
| [`user.entity.ts`](../src/modules/users/entities/user.entity.ts) | Users | Application login identity, FK to Role |
| [`role.entity.ts`](../src/modules/roles/entities/role.entity.ts) | RBAC | Role catalogue |
| [`permission.entity.ts`](../src/modules/permissions/entities/permission.entity.ts) | RBAC | Permission catalogue, M2M to roles |
| [`invitation.entity.ts`](../src/modules/invitations/entities/invitation.entity.ts) | Invitations | Email invite tokens/state |
| [`employee.entity.ts`](../src/modules/employees/entities/employee.entity.ts) | Employees | Workforce master (+ leave counters, passports, histories) |
| [`employee-skill.entity.ts`](../src/modules/employee-skills/entities/employee-skill.entity.ts) | Employee skills | Employee ↔ skill linkage with rating |
| [`skill.entity.ts`](../src/modules/skills/entities/skill.entity.ts) | Skills | Skill rows |
| [`skill-type.entity.ts`](../src/modules/skills/entities/skill-type.entity.ts) | Skills | Classification of skill groups |
| [`client.entity.ts`](../src/modules/clients/entities/client.entity.ts) | Clients | Client organizations |
| [`project.entity.ts`](../src/modules/projects/entities/project.entity.ts) | Projects | Placement vehicles with client linkage |
| [`project-skill.entity.ts`](../src/modules/project-skills/entities/project-skill.entity.ts) | Project skills | Required skills metadata per project |
| [`mobilization.entity.ts`](../src/modules/mobilizations/entities/mobilization.entity.ts) | Mobilizations | Movement history/status between idle & projects |
| [`timesheet.entity.ts`](../src/modules/timesheets/entities/timesheet.entity.ts) | Timesheets | Monthly header per supervision context |
| [`timesheet-entry.entity.ts`](../src/modules/timesheets/entities/timesheet-entry.entity.ts) | Timesheets | Discrete day/intersection cells |
| [`special-day.entity.ts`](../src/modules/special-days/entities/special-day.entity.ts) | Special days | Holiday / uplift calendar |
| [`rate-variant.entity.ts`](../src/modules/rate-variants/entities/rate-variant.entity.ts) | Rate variants | Named reusable rate slabs |
| [`project-special-day-rate.entity.ts`](../src/modules/projects/entities/project-special-day-rate.entity.ts) | Projects | Overrides how special-days price on a given project |
| [`project-rate-variant-rate.entity.ts`](../src/modules/projects/entities/project-rate-variant-rate.entity.ts) | Projects | Joins variants to negotiated rates |
| [`payroll.entity.ts`](../src/modules/payroll/entities/payroll.entity.ts) | Payroll | Computed/compensation rows per worker-month |
| [`invoice.entity.ts`](../src/modules/invoices/entities/invoice.entity.ts) | Invoices | Client-facing billing artefacts |
| [`settlement.entity.ts`](../src/modules/settlements/entities/settlement.entity.ts) | Settlements | End-of-employment payout packages |

## Relationship highlights (logical)

1. **`Client` 1→N `Project`** underpin commercial timelines.
2. **`Employee` interacts with `Mobilization`**, `Timesheet(+Entry)`, `Payroll`, and `Settlement` throughout lifecycle milestones.
3. **`ProjectSkills`/`EmployeeSkills`** power allocation matching surfaced in mobilizations & grids.
4. **RBAC** isolates privileged controller operations (`User.roleId → Role.permissions`).

Consult individual services (`*.service.ts`) for transactional composition (e.g. payroll pulls approved timesheets, settlements read mobilization durations).
