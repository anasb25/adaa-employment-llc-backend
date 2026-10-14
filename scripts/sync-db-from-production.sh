#!/usr/bin/env bash
# Download production PostgreSQL and restore into local adaa_db.
# Usage (from repo root):
#   export PROD_HOST=159.223.202.7
#   export PROD_PASSWORD='your-prod-password'
#   export LOCAL_PASSWORD=postgres   # optional, default postgres
#   ./scripts/sync-db-from-production.sh

set -euo pipefail

PROD_HOST="${PROD_HOST:-159.223.202.7}"
PROD_PORT="${PROD_PORT:-5432}"
PROD_USER="${PROD_USER:-postgres}"
PROD_DB="${PROD_DB:-adaa_db}"
LOCAL_HOST="${LOCAL_HOST:-localhost}"
LOCAL_PORT="${LOCAL_PORT:-5432}"
LOCAL_USER="${LOCAL_USER:-postgres}"
LOCAL_DB="${LOCAL_DB:-adaa_db}"
LOCAL_PASSWORD="${LOCAL_PASSWORD:-postgres}"

if [[ -z "${PROD_PASSWORD:-}" ]]; then
  echo "Set PROD_PASSWORD (production DATABASE_PASSWORD) before running." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_FILE="${ROOT}/adaa_prod.dump"

echo "Dumping ${PROD_DB} from ${PROD_HOST}..."
PGPASSWORD="$PROD_PASSWORD" pg_dump \
  -h "$PROD_HOST" \
  -p "$PROD_PORT" \
  -U "$PROD_USER" \
  -d "$PROD_DB" \
  -F c \
  -f "$DUMP_FILE"

echo "Recreating local database ${LOCAL_DB}..."
PGPASSWORD="$LOCAL_PASSWORD" dropdb \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  --if-exists \
  "$LOCAL_DB" || true

PGPASSWORD="$LOCAL_PASSWORD" createdb \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  "$LOCAL_DB"

echo "Restoring into local ${LOCAL_DB}..."
PGPASSWORD="$LOCAL_PASSWORD" pg_restore \
  -h "$LOCAL_HOST" \
  -p "$LOCAL_PORT" \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE"

echo "Done. Local DB matches production snapshot: ${DUMP_FILE}"
