# Timesheets domain

Modern timesheets track **calendar-month grids per project**, with granular **daily entries**, approval workflows, and optional **mobilization synchronization**. This supersedes any legacy “bulk daily row per allocation” API described in obsolete docs.

References: [`TimesheetsModule`](../src/modules/timesheets/timesheets.module.ts), [`TimesheetsController`](../src/modules/timesheets/timesheets.controller.ts), [`TimesheetsService`](../src/modules/timesheets/timesheets.service.ts), entities [`timesheet.entity.ts`](../src/modules/timesheets/entities/timesheet.entity.ts) and [`timesheet-entry.entity.ts`](../src/modules/timesheets/entities/timesheet-entry.entity.ts).

## HTTP overview

All endpoints are under **`/api/timesheets`** and require JWT (`TimesheetsController` applies `@UseGuards(JwtAuthGuard)` globally).

See the **Timesheets** section in [`http-api-reference.md`](./http-api-reference.md).

## Retrieval operations

### Daily utilization

`GET /api/timesheets/daily-utilization?date=<YYYY-MM-DD>`

Produces a consolidated daily utilization snapshot for reporting/UI dashboards.

### Month views

- **`GET /api/timesheets/all-projects/month/:month`** — `month` like `2026-02`; returns combined monthly data for UI that lists every project grid in one payload.
- **`GET /api/timesheets/project/:projectId/month/:month`** — project-scoped monthly timesheet skeleton plus cells/entries backing the editable grid.

### Administrative listing / detail / delete

- **`GET /api/timesheets`** — filtered list (`TimesheetFiltersDto` drives query parsing).
- **`GET /api/timesheets/:id`** — hydrate a single aggregate.
- **`DELETE /api/timesheets/:id`** — remove a timesheet; service records actor via `req.user` (JWT user loaded by Passport).

---

## Mutation workflow

### Create or reopen header

**`POST /api/timesheets`**

Upserts the timesheet “header” for a **project × month × preparer identity** grouping (consult `CreateTimesheetDto`). Returns/exposes the persisted structure so the frontend can hydrate entry editing.

### Save entry grid

**`PUT /api/timesheets/:id/entries`** (`SaveTimesheetEntriesDto`)

Bulk upserts/removes typed cell entries for calendar days tied to allocations/mobilizations. Validation rules live in service + DTO.

### Submission & approval gates

**`POST /api/timesheets/:id/submit`** (`SubmitTimesheetDto`)

Moves the lifecycle forward for supervisor submission (exact status flags are stored on the aggregate — reference entity enums in code).

**`POST /api/timesheets/:id/approve`** (`ApproveTimesheetDto`)

Approves/rejects downstream; aligns with downstream payroll ingestion that reads **approved** timesheets (`PayrollService` calculate paths).

---

## Mobilization synchronization helpers

Keeping mobilization timelines and spreadsheet cells coherent is assisted by paired endpoints:

| Endpoint | Behaviour |
|-----------|-----------|
| `POST .../timesheets/entries/:entryId/sync-to-mobilization` | Treat the timesheet cell as authoritative; adjusts mobilization to match (`syncMobilizationFromEntry`) |
| `POST .../timesheets/entries/:entryId/sync-from-mobilization` | Drops the overriding entry so mobilization-derived defaults flow back (`removeEntryUseMobilization`) |

These support scenarios where supervisors edit either staffing records or grids first.

---

## Payroll coupling

Monthly payroll calculators (`PayrollService`) consume approval state tied to periods with approved monthly timesheets. After changing statuses or retroactively editing grids, rerun calculate endpoints documented in [`payroll-invoices-settlements.md`](./payroll-invoices-settlements.md).

---

## Testing tips

Cover:

- Sequential save → submit → approve path for a fictitious allocation.
- Mobilization sync round trips.
- Deleted timesheet cascading expectations (consult service transactional sections).
