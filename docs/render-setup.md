# Render + Supabase demo

The prepared configuration builds React and FastAPI into one container. Render serves the website at `/` and the API at `/api` on the same HTTPS origin. Supabase holds PostgreSQL data and private incident photos. Local development keeps its existing storage and proxy setup.

The site runs at [BarangAI](https://barangai-watch.onrender.com). On 3 November 2026 its website files and API routes matched commit `e5fcb04` on `main`. Future publishing and deployment still require user authorization. For a new installation, creating a Blueprint starts its initial deployment, so perform that step only when authorized.

## 1. Accounts and source

Create a [Render account](https://dashboard.render.com/) and a Supabase Free project, preferably in Singapore. Complete [Supabase setup](supabase-setup.md), including its private bucket and database security configuration. Then, with the user's authorization, publish this repository to a Git provider that Render supports. Render cannot build an unpublished local directory.

The root `render.yaml` declares exactly one `free` web service in Singapore. It creates no Render database, disk, worker, or paid resource. The [current free compute plan](https://render.com/docs/compute-plans) provides 512 MB of memory and 0.1 CPU. The image includes the MobileCLIP2-S0 category checker on ONNX Runtime (no PyTorch). Verify resource use before release and check predictions on the actual host afterward; see [AI readiness](deployment.md#ai-readiness).

## 2. Private environment settings

Enter these values in the Render Blueprint setup prompts. They are marked `sync: false`, so credentials stay out of the repository and frontend build.

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL URL in the form shown in the Supabase guide: `postgresql://`, the `postgres.PROJECT_REF` user, a percent-encoded password and `sslmode=require`. Use the session pooler from the Supabase Connect dialog if direct IPv6 is unavailable; see the Supabase guide. |
| `SUPABASE_URL` | The project's `https://<project-ref>.supabase.co` URL. |
| `SUPABASE_SECRET_KEY` | A server-only `sb_secret_...` key. Never place it in a `VITE_` variable, frontend code, or a public document. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKERS_AI_TOKEN` | Optional. The Cloudflare account ID and a Workers AI API token, for photo descriptions and the chatbot. Keep the account on the Workers Free plan so usage never bills. |
| `GEOCODER_CONTACT` | Optional. A contact email for OpenStreetMap's usage policy; street names work without it. |
| `TRUSTED_PROXY_HOPS` | The number of proxies in front of the app. Leave blank at first; see [limits](deployment.md#data-and-operating-limits). |
| `OPERATOR_NAME`, `PRIVACY_CONTACT` | Who runs the service and how to reach them. Shown on the terms and privacy pages, which say the details are unpublished until these are set. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Optional, for resident Google sign-in. The redirect URI is `https://<service>.onrender.com/api/auth/google/callback`. |

The Blueprint sets `MEDIA_STORAGE=supabase`, `SUPABASE_STORAGE_BUCKET=incident-photos`, `COOKIE_SECURE=true`, and `STATIC_SITE_DIR=/app/static`. If you choose a different private bucket name, update that setting before deployment. Leave `API_ROOT_PATH` unset; the application mounts `/api` itself. The image supplies the checker's model path, its hash checks, the duplicate-embedding version and `GEOCODER=nominatim`. Keep optional paid services unset.

## 3. Review and deploy when authorized

In Render, choose **New → Blueprint** and select the published repository. Review the resource list before creating it: one Docker web service, **Free**, Singapore. Enter the private settings above. If the name `barangai-watch` already belongs to another service, choose an unused name rather than applying this Blueprint to an unrelated service.

`autoDeployTrigger: commit` deploys every commit on the connected branch, so merging to `main` puts it live. Work on a branch and merge only what is ready. Do not enable automatic Blueprint sync unless changes to the infrastructure are also authorized. See [Render deployment controls](https://render.com/docs/deploys).

The image builds with `deploy/Dockerfile.render`. Startup checks the required environment, upgrades the database with Alembic, and starts one application worker on Render's `PORT`. The free service has no paid pre-deploy step, so migrations run at startup. Keep schema changes compatible with the previous release; rolling back an application image does not undo database migrations. Never run a schema downgrade against live data without a reviewed backup and explicit authorization.

**If startup fails with `password authentication failed`:** the password in `DATABASE_URL` is wrong or badly encoded. Reset it in Supabase if unsure, percent-encode it (`@` becomes `%40`, `#` becomes `%23`, `/` becomes `%2F`), and check the user is `postgres.PROJECT_REF`, not `postgres`. Startup refuses Supabase's `[YOUR-PASSWORD]` placeholder and warns when `sslmode` is missing.

Create the initial staff account from a trusted local terminal connected to this database with `python -m barangai.bootstrap_staff <staff-email>` inside `apps/api`. It prompts privately for the password. Once barangays are loaded (see [deployment guide](deployment.md#staff-jurisdiction)), staff accounts also need `--barangay "<name>"`. Render's free service does not provide an interactive shell. Use synthetic accounts and reports for the demonstration.

## 4. Verification after deployment

1. Wait for Render to report the deployment live; inspect logs for migration or startup failures. [HTTP readiness checks](https://render.com/docs/health-checks) use `/api/health`.
2. Open the HTTPS site and register a synthetic resident. Confirm login and upload a synthetic photo from the file picker.
3. Confirm the resident can view their photo and another resident cannot fetch it. Check the photo bucket remains private.
4. Sign in as staff, verify the report, and change its status. Confirm the resident sees the notification and the updated report.
5. Restart the service, sign in again, and confirm the report and photo remain available. Inspect the Supabase database and bucket for the persisted records.
6. Repeat the upload flow on a physical phone using both an existing image and a new photo. Browser automation alone does not prove the phone's file picker works.

Remote checks and physical phone checks require the intended service, credentials and deployment authorization. Local container verification does not prove cloud connectivity or native phone camera behavior.

## Free service limits

Render's [free service limits](https://render.com/docs/free) include sleeping after 15 idle minutes, a cold start on the next visit, and ephemeral local files. Free hours, build minutes, and bandwidth have usage limits. Use a free account without a payment method for a strict no-billing demo, or review spending controls before adding payment details. Keep an eye on Supabase quotas too. This setup is for a demonstration, not an emergency response service.

## Local validation

With Docker running, build from the repository root:

```sh
docker build --file deploy/Dockerfile.render --tag barangai-render .
```

Run the offline packaged-image check with the Free plan's resource limits (PowerShell or a POSIX shell, from the repository root):

```sh
docker run --rm --network none --memory 512m --memory-swap 512m --cpus 0.1 --mount "type=bind,source=${PWD}/deploy/verify-render-ai.py,target=/tmp/verify-render-ai.py,readonly" --entrypoint python barangai-render /tmp/verify-render-ai.py
```

This uses synthetic accounts and photos in a temporary local database, with no external connections. It checks the compiled website, authentication, real-model previews, resident category preservation, private sanitized photos, large image handling, and reports startup time, latency and peak memory. It bypasses the provider startup script, so hosted migrations and Supabase connectivity must be checked separately.

Validate `render.yaml` against [Render's current JSON Schema](https://render.com/schema/render.yaml.json). If a compatible Render CLI is already installed, `render blueprints validate render.yaml` adds platform validation without creating resources.
