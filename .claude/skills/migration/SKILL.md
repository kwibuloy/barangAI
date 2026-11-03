---
name: migration
description: Create and verify an Alembic schema migration for the BarangAI API. Use whenever apps/api/barangai/models.py changes.
---

Work in `apps/api` with the project venv (`../../.venv/Scripts/python.exe -m alembic ...`).

1. Change `barangai/models.py` first. Then copy the style of the latest file in `migrations/versions/`: sequential revision IDs (`"0006"`, `down_revision = "0005"`) and a file named `000N_<snake_name>.py`. Autogenerate (`alembic revision --autogenerate -m ... --rev-id 000N`) only as a draft against a scratch SQLite DB, and always edit the result by hand.
2. Postgres rule: every new table gets `ALTER TABLE public."<table>" ENABLE ROW LEVEL SECURITY` behind `if op.get_context().dialect.name == "postgresql"`, and never any client policies. Supabase access is server-only.
3. Write `downgrade()`. It must preserve existing rows. Add server defaults when adding NOT NULL columns to populated tables.
4. Verify against a scratch SQLite file outside the repo: `DATABASE_URL=sqlite:///<scratch>/m.db alembic upgrade head`, then `alembic downgrade -1`, then `alembic upgrade head`. Then run `apps/api/tests/test_database.py`.
5. If Docker is running, run `deploy/verify-local-postgres.py` for real Postgres and RLS. Never point it, or a migration, at Supabase without the user's direct approval. Render runs `alembic upgrade head` on start (`deploy/start-render.sh`), so deploying a migration means changing the live database.
