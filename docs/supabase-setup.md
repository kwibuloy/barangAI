# Supabase setup for the Render demo

BarangAI keeps its own resident/staff/administrator accounts, sessions and API permissions. Supabase provides PostgreSQL and a private photo bucket. Do not add Supabase Auth users or browser access to the application tables.

## Database connection

Create a Free Supabase PostgreSQL project in a suitable region and save its database password in a password manager. No cloud project has been created by the local build.

In the project's **Connect** dialog choose **Session pooler**. Copy its actual host, username and port; the shared session pooler supports IPv4 and uses port **5432**. This suits the persistent Render Python service. Do not guess the region hostname or use transaction mode port 6543 for these instructions.

Set `DATABASE_URL` only in the server's secret environment settings:

```text
postgresql://postgres.PROJECT_REF:PERCENT_ENCODED_PASSWORD@COPIED_POOLER_HOST:5432/postgres?sslmode=require
```

Percent encode reserved password characters. `sslmode=require` requires encryption; for certificate and hostname verification use `sslmode=verify-full&sslrootcert=/app/supabase-ca.crt` (the image includes that certificate). Never disable TLS verification to work around a connection error. The application uses psycopg2 (the API's `postgres` extra, which the Render image installs), prechecks reused connections and allows at most five connections per worker (three pooled plus two temporary overflow connections). Start the demo with one worker.

Use the table-owner connection (`postgres.PROJECT_REF` in the copied pooler URL) for the demo and migrations. It is privileged: keep the password only on the API server. The application tables have RLS enabled with no client policies; a non-owner role without an explicit server policy would be denied too. A separate restricted runtime role requires a deliberate follow-up design and verification, rather than broad public policies.

## Apply the application's migrations

The repository uses **Alembic**, not Supabase CLI migration history. From `apps/api`, with `DATABASE_URL` supplied securely in the environment:

```powershell
python -m alembic upgrade head
```

Use a direct PostgreSQL connection for migrations when your environment supports its address family. If only IPv4 is available, the copied session pooler URL is the alternative; never use transaction pooling for schema changes. Take a backup before migrating an existing project.

Migration `0004` enables RLS on `users`, `sessions`, `reports`, `report_events`, `staff_actions`, `duplicate_suggestions`, `notifications`, and `alembic_version`; later migrations add the same protection to `oauth_identities`, `cases`, `report_addenda`, `barangays`, `daily_usage` and `deletion_requests`. These migrations create **no client policies**: `anon` and `authenticated` cannot read or write rows through the Data API. The table owner retains database access and the API enforces the project's existing permissions. SQLite local development is unchanged. Any new application table in an exposed schema must receive the same protection in its migration. Do not downgrade `0004` on an exposed project: its downgrade removes that RLS protection.

Do not create permissive policies to silence the advisor's informational “RLS enabled, no policy” finding. That default denial is intentional for this server-only architecture. Do not expose privileged SQL functions or views of these tables. Keep browser requests going through BarangAI's API.

## Verify before sharing a deployed link

Run in the Supabase SQL editor as the owner after migrations:

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'users', 'sessions', 'reports', 'report_events', 'staff_actions',
  'duplicate_suggestions', 'notifications', 'alembic_version', 'oauth_identities',
  'cases', 'report_addenda', 'barangays'
) ORDER BY c.relname;

SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (
  'users', 'sessions', 'reports', 'report_events', 'staff_actions',
  'duplicate_suggestions', 'notifications', 'alembic_version', 'oauth_identities',
  'cases', 'report_addenda', 'barangays'
);
```

Expect twelve tables with RLS enabled, not forced, and zero policies on these tables. In an isolated synthetic smoke test, verify the owner can read/write, and requests using both anonymous and signed-in Supabase client roles cannot read or change synthetic rows. Run Supabase's database security advisors; review all findings. Then test resident ownership, staff/admin permissions and private-photo access through BarangAI's API. SQL generation alone does not prove the deployed role permissions.

## Private photos

Use a private bucket with no public download policies. The backend's separate Supabase secret API key is for Storage requests, not the PostgreSQL password. Keep it on the server and never in `VITE_*` settings. BarangAI sanitizes images before upload and checks its own sessions and report permissions before returning image bytes. See the Render deployment guide for the configured environment variables and bucket setup.

## Evidence and remaining gates

The local suite verifies SQLite migration preservation and generates PostgreSQL RLS migration SQL, including a percent-encoded database password. Docker PostgreSQL verification (`deploy/verify-local-postgres.py`) also proves actual migrations, legacy-row preservation, non-superuser owner access, denial for local client roles, and photo/report persistence after database restart. Live Supabase verification ([evidence](feature-status.md#evidence)) passed approved migration 0005, TLS certificate/hostname validation, actual client-role/Data API denial, private Storage photo upload/download, app logout/cross-resident isolation and synthetic cleanup. Hosted website and physical-device checks remain separate gates before real resident use.

Sources: [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
