# Operations

## Scheduled tasks ([`CronjobsService`](../src/shared/cronjobs.service.ts))

`ScheduleModule.forRoot()` in [`AppModule`](../src/app.module.ts) enables `@Cron` decorators on providers.

Implemented jobs:

| Schedule | Handler | Behaviour |
|---------|---------|-----------|
| **Midnight UTC** (`CronExpression.EVERY_DAY_AT_MIDNIGHT`) | `handleCron()` | Structured placeholder hook — currently logs only; extend safely with idempotent work |
| **01:00 daily** (`EVERY_DAY_AT_1AM`) | `updateEmployeeAirTicketsAndAnnualLeave()` | Reconciles entitlement counters for every employee whose `date_of_joining` is set |

### Air tickets & annual leave accrual design

Detailed inline comments summarize business rules inside `CronjobsService`. At a glance:

1. Loads all employees joined on some date (`date_of_joining IS NOT NULL`).
2. Calculates service window end as **today** or latest **mobilization cancellation date** (`JobStatus.CANCELLED` max `actionDate` per worker).
3. **Air ticket count**: floor of completed service years versus prior stored value — updates `air_tickets` and optionally appends JSON history helpers from [`air-ticket-history.util.ts`](../src/modules/employees/utils/air-ticket-history.util.ts).
4. **Annual leave**: compares completed-service months versus `annual_leave_accrued_months`, adding **MONTHLY_LEAVE_ACCRUAL** days per trailing month (`completedMonthsBetween` from [`date.util.ts`](../src/common/utils/date.util.ts)). Negative deltas resync accrued-month counters without harming manually adjusted balances (see guarded branch).

Operational guidance:

- Cron logs run at `log` / `debug` / `warn` severities; monitor these in production log aggregation.
- Ensure database migrations adding accrual columns (`annual_leave_accrued_months`, history JSON, etc.) have been applied before relying on accrual math.

---

## Email delivery ([`EmailService`](../src/email/email.service.ts))

- Constructed with **nodemailer** using Gmail transport (`service: 'gmail'`).
- Credentials from [`mail.config.ts`](../src/config/mail.config.ts): `MAIL_USER`, `MAIL_PASS`, default `from` via `DEFAULT_MAIL_FROM`.
- `sendMail` throws on failure after logging the root error.

Usage appears in modules such as **auth** (password reset) and **invitations** (invite acceptance links). When running locally without credentials, expect runtime errors on mail-sending code paths — mock or disable those flows for dev as appropriate.

---

## Static assets

The `npm run build` pipeline copies `src/assets` to `dist/assets` for runtime file reads (fonts, HTML templates, etc.) consumed by PDF generators or other services.

---

## Observability & troubleshooting

| Symptom | Check |
|---------|--------|
| 401 on protected routes | Token expiry, wrong `Authorization` header, inactive user |
| Permission denied despite admin account | [`RolesGuard`/`PermissionsGuard`](../src/common/guards/authorization.guard.ts) short-circuit — not actually enforcing |
| Migration failures | DB URL, prior partial runs, `npm run show-migrations` |
| PDF routes hang / OOM | Puppeteer headless profile, server memory, sandbox policies |
| Cron not firing | Process calendar timezone vs `CronExpression` defaults, ensure single instance leader in clustered deploys |

---

## Deployment notes

- Run **`npm run build`** then **`npm run start:prod`** (Node executes `dist/main`).
- Apply migrations with **`npm run run-migrations`** against production credentials in a controlled release step.
- Configure environment variables through your host’s secret store; never commit `.env` files.
