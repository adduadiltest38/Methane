#!/usr/bin/env bash
# Apply db/migrations/*.sql in order, skipping ones already recorded in schema_migrations.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());"

for f in "$DIR"/*.sql; do
  name="$(basename "$f")"
  applied=$(psql "$DATABASE_URL" -tA -c "SELECT 1 FROM schema_migrations WHERE filename = '$name'")
  if [[ "$applied" == "1" ]]; then
    echo "skip   $name"
    continue
  fi
  echo "apply  $name"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -1 \
    -f "$f" \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$name')"
done
