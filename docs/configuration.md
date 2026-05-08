# Configuration & environment

Configuration is driven by **`@nestjs/config`** with namespaces registered in [`src/app.module.ts`](../src/app.module.ts). Files are loaded from **`.env.local`** first, then **`.env`** (see `envFilePath`).

## Application (`registerAs('app', …)`)

Defined in [`src/config/app.config.ts`](../src/config/app.config.ts).

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Logical environment label |
| `PORT` | `3000` | HTTP listen port |
| `FRONTEND_URL` | `http://localhost:5173` | Used where the backend needs links to the SPA (invites, mails, etc.) |

## Database (`registerAs('database', …)`)

Defined in [`src/config/database.config.ts`](../src/config/database.config.ts).

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_USERNAME` | `postgres` | Database user |
| `DATABASE_PASSWORD` | *(unset)* | Database password (**required** in real deployments) |
| `DATABASE_NAME` | `adaa_db` | Database name |

[`src/database/data-source.ts`](../src/database/data-source.ts) imports `dotenv/config` explicitly so CLI migrations resolve the same variables when Nest is not bootstrapped.

## Authentication (`registerAs('auth', …)`)

Defined in [`src/config/auth.config.ts`](../src/config/auth.config.ts).

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | *(dev fallback in file — replace in prod)* | Access token signing |
| `JWT_EXPIRES_IN` | `24h` | Access token lifetime |
| `JWT_REFRESH_SECRET` | *(dev fallback in file — replace in prod)* | Refresh token signing |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost |

Production **must** set strong, unique secrets; never rely on placeholders in [`auth.config.ts`](../src/config/auth.config.ts).

## Mail (`registerAs('mail', …)`)

Defined in [`src/config/mail.config.ts`](../src/config/mail.config.ts). Used by [`EmailService`](../src/email/email.service.ts) (Gmail transport).

| Variable | Purpose |
|----------|---------|
| `MAIL_USER` | SMTP / Gmail username |
| `MAIL_PASS` | App password or credential |
| `DEFAULT_MAIL_FROM` | Default sender when `from` is omitted |
