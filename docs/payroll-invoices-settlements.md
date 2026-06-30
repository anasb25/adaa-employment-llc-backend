# Payroll, invoices & settlements

Finance-related modules interoperate through **employees**, **approved timesheets**, **mobilizations**, **projects/clients**, and **special-day/project rate** tables where applicable.

## Payroll (`PayrollModule`)

### Responsibilities ([`payroll.controller.ts`](../src/modules/payroll/payroll.controller.ts))

- Listing with filters (`GET /payroll`) and narrowing by **`month`** slug (`yyyy-MM`).
- Existence probing per employee/month (`GET /payroll/check/:employeeId/:month`).
- Manual CRUD: `POST`, `PUT/:id`, `DELETE/:id`.
- Convenience writes: **`upsert`** and **`bulk`** for batch ingestion from UI spreadsheets.
- **Calculation engines** tying timesheet-approved hours to computed rows:
  - `POST /payroll/calculate/month/:month`
  - `POST /payroll/calculate/project/:projectId/month/:month`
- Operational imports: allowances/deductions Excel ingest (`multipart/form-data` upload) plus downloadable template helpers.
- **PDF export**: `GET /payroll/:id/pdf` renders server-side HTML and prints via Puppeteer ([`payroll-pdf.service.ts`](../src/modules/payroll/services/payroll-pdf.service.ts)), mirroring invoice delivery style.

Decorators **`@Permissions('payroll:...')`** document intended RBAC granularity; revisit guard enforcement notes in [`security-auth-rbac.md`](./security-auth-rbac.md).

### Implementation anchor files

[`PayrollService`](../src/modules/payroll/payroll.service.ts) — domain math, allowances import via `xlsx`, PDF coordination.

[`PayrollPdfService`](../src/modules/payroll/services/payroll-pdf.service.ts) — browser-based PDF buffering.

[`Payroll` entity](../src/modules/payroll/entities/payroll.entity.ts) — persisted payslip aggregates per employee-period.

---

## Invoices (`InvoicesModule`)

### Responsibilities ([`invoices.controller.ts`](../src/modules/invoices/invoices.controller.ts))

- Index & detail retrieval.
- `POST /invoices/generate` — deterministic creation from billed work windows.
- State transitions reflecting commercial workflow: **`approve`**, **`send`**, **`paid`** staged posts.
- `PATCH /invoices/:id` — corrective edits constrained by validation DTOs.
- **`GET /invoices/:id/pdf`** customer-facing artifact (HTML+Puppeteer path parallel to payroll).
- Soft batch delete helpers via `POST /invoices/actions/delete-many`.

Check [`invoice.entity.ts`](../src/modules/invoices/entities/invoice.entity.ts) for stored totals, numbering, linkage fields to projects/clients/month keys.

---

## Settlements (`SettlementsModule`)

Covers separation packages / statutory gratuity style workflows aligned with UAE labour practice assumptions coded in [`settlements.service.ts`](../src/modules/settlements/settlements.service.ts).

### Highlights ([`settlements.controller.ts`](../src/modules/settlements/settlements.controller.ts))

- Listing, search shortcuts, fetching by **`employeeId`** bundles.
- `GET .../calculate-gratuity/:employeeId` preview endpoint for HR prior to committing numbers.
- Create/update/delete/batch delete symmetrical with other modules.
- Approval & payout markers: **`/:id/approve`**, **`/:id/mark-paid`**.
- **`GET .../settlements/:id/excel`** emits spreadsheet-friendly settlement statements.

Entity: [`settlement.entity.ts`](../src/modules/settlements/entities/settlement.entity.ts).

---

## Cross-links

| Concern | See also |
|---------|----------|
| Timesheets approval prerequisites | [`timesheets.md`](./timesheets.md) |
| Employee doc expiries surfaced to UI | Dashboard `GET /dashboard/expiring-documents` ([`dashboard.service.ts`](../src/modules/dashboard/dashboard.service.ts)) |
| Scheduled accruals touching employees | [`operations.md`](./operations.md) |
