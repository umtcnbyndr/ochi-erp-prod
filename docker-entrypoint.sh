#!/bin/sh
set -e

echo "[ochi-erp] Running Prisma migrations..."
npx prisma migrate deploy || {
  echo "[ochi-erp] Migration failed, attempting db push as fallback..."
  npx prisma db push --skip-generate || true
}

echo "[ochi-erp] Starting Next.js server..."
exec "$@"
