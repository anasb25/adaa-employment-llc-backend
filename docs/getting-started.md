# Getting started

## Prerequisites

- Node.js compatible with NestJS 11 (see `package.json` engines if added)
- PostgreSQL instance
- npm (or another compatible package manager)

## Installation

From the backend project directory:

```bash
npm install
```

## Configuration

Copy or create `.env` (and optionally `.env.local`) based on [Configuration & environment](./configuration.md). Minimum required variables include database credentials and `JWT_SECRET`.

## Running the API

```bash
# Development (watch mode)
npm run start:dev

# Standard start
npm run start

# Production (after build)
npm run build
npm run start:prod
```

Default HTTP port comes from `PORT` or **3000** ([`src/config/app.config.ts`](../src/config/app.config.ts)).

Console output includes the listening URL including the `/api` prefix.

## Build

Assets under `src/assets` are copied to `dist/assets` during `npm run build` (see `package.json` `build` script).

## Linting & format

```bash
npm run lint
npm run format
```

## Tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## Database migrations

See [Database & migrations](./database-and-migrations.md) for `typeorm`-based commands wired in `package.json` (`run-migrations`, `revert-migration`, `generate-migration`, etc.).

## Health check

After the server starts:

- `GET /api` — hello string (`AppController`)
- `GET /api/health` — JSON `{ status, timestamp, service }`
