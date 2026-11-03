#!/bin/sh
set -eu

# Fail before accepting traffic rather than writing data to ephemeral local storage.
: "${DATABASE_URL:?Set the Supabase PostgreSQL connection URL}"
: "${SUPABASE_URL:?Set the Supabase project URL}"
: "${SUPABASE_SECRET_KEY:?Set a server-only Supabase secret key}"
: "${SUPABASE_STORAGE_BUCKET:?Set the private incident photo bucket}"
case "$DATABASE_URL" in
  postgresql://*|postgresql+psycopg2://*) ;;
  *) echo "Render requires an external PostgreSQL DATABASE_URL" >&2; exit 1 ;;
esac
if [ "${MEDIA_STORAGE:-}" != "supabase" ] || [ "${COOKIE_SECURE:-}" != "true" ]; then
  echo "Render requires MEDIA_STORAGE=supabase and COOKIE_SECURE=true" >&2
  exit 1
fi
test -f "${STATIC_SITE_DIR:?Set the compiled website directory}/index.html"

# The free compute plan has no pre-deploy command. Run one app instance only.
alembic upgrade head
exec uvicorn barangai.main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
