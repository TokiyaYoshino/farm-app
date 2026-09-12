#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env.local
set +a

mkdir -p "$HOME/backups/farm-app"

PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/pg_dump \
  --host=aws-1-ap-northeast-1.pooler.supabase.com \
  --port=5432 \
  --username=postgres.fgoyqwdwnimvyyuxoymy \
  --dbname=postgres \
  --format=custom \
  --file="$HOME/backups/farm-app/pre-rls_$(date +%Y%m%d_%H%M%S).dump"
