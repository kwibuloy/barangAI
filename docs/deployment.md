# Render + Supabase deployment readiness

> Parked on 3 November 2026: the project now runs locally. See [mobile.md](mobile.md). The staff jurisdiction steps below still apply locally.

The selected route is Render Free + Supabase Free, replacing the earlier OCI proposal. A single container serves the React website and FastAPI under one HTTPS origin. PostgreSQL and private photos persist in Supabase. The public service is [BarangAI](https://barangai-watch.onrender.com). On 3 November 2026 `/api/health` returned `{"status":"ok"}` and its website files and API routes matched commit `e5fcb04`. Because startup runs Alembic before the server, a running service also means its migrations succeeded. This verifies availability, not classification accuracy, signed-in flows or maximum-load memory use.

Follow [Render setup](render-setup.md), [Supabase setup](supabase-setup.md), and [Google sign-in setup](google-sign-in.md). The root render.yaml declares one Free Docker service, deployment on every commit and no paid Render database or disk. Credentials belong only in server secret settings. Publishing, project selection and deployment still require the user's authorization.

## Gates before sharing a presentation link

1. Publish the intended Git repository with authorization. Select the intended Supabase Free project and create a private incident-photos bucket. Configure its HTTPS project URL, server-only secret key and PostgreSQL session-pooler URL. Do not reuse an unrelated project without approval.
2. Build the application container, apply Alembic migrations and verify PostgreSQL owner/client isolation, TLS and Storage permissions on the actual providers. Local Docker PostgreSQL and live Supabase checks passed (see [feature status](feature-status.md#evidence)); hosted application checks remain pending.
3. Run the [presentation sequence](presentation-demo.md) through the real HTTPS URL. Check mobile camera and gallery uploads, GPS/map fallback, resident submission/history/chat, staff verification/actions, notifications, logout and cross-resident photo denial. Restart the service and verify photo/report persistence.
4. Configure Google OAuth and perform a consented resident sign-in through the exact hosted callback. Keep optional LLM credentials absent unless the account is confirmed to prevent paid usage.
5. Record actual outcomes in the [evaluation pack](evaluation.md). Browser simulation does not prove a physical phone's native camera or picker works.

## AI readiness

The Render image runs the category checker on ONNX Runtime only (no PyTorch): `CHECKER_MODEL_DIR=/app/models/mobileclip2-s0`, build-time SHA-256 checks of `visual.onnx` and `checker.json`, and `VALIDATED_EMBEDDING_MODEL_VERSION=mobileclip2-s0:effec85f7f21` so duplicate review uses its embeddings. `GEOCODER=nominatim` turns on street names; set `GEOCODER_CONTACT` to a contact email for Nominatim's usage policy.

The vision model runs only when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_TOKEN` are set (the chatbot's account). `CLOUDFLARE_VISION_MODEL` picks the model (default `@cf/mistralai/mistral-small-3.1-24b-instruct`, about 5 neurons and 2 s per photo; Gemma 3 is not allowed on Workers Free accounts). The free tier is 10,000 neurons a day, shared with the chatbot, and never bills on the Workers Free plan (check the account's plan: Workers Paid bills overage); when it runs out the checker fills the category and the description stays empty. Llama 3.2 Vision needs a one-time licence acceptance call (`{"prompt": "agree"}`) before use.

Before release, measure checker latency and memory under the Free plan's limits, and confirm one live Cloudflare call. Re-export the checker with `apps/api/tools/export_checker.py` after changing its prompts; that changes the embedding version, so update the variable above and regenerate duplicate suggestions.

## Data and operating limits

Render Free sleeps when idle; Supabase Free can pause inactive projects and has storage/database quotas. Check current free-plan settings before a presentation, keep backups and allow time for startup. Leave paid upgrades disabled where possible. See the linked provider guides for verified restrictions.

Abuse limits counted in the database (`usage.py`), so Render's sleep does not reset them: new accounts site-wide (`MAX_SIGNUPS_PER_HOUR`, default 100), photo suggestions per resident (`MAX_PREVIEWS_PER_DAY`, 40), reports site-wide (`MAX_SITE_REPORTS_PER_DAY`, 300), Cloudflare calls site-wide (`MAX_SITE_VISION_PER_DAY`, 1,500, then the checker answers alone; `MAX_SITE_CHAT_AI_PER_DAY`, 500, then fixed guidance) and deletion requests per resident (`MAX_DELETION_REQUESTS_PER_DAY`, 20). The defaults are untuned starting values. A full site-wide cap also blocks honest users until the period ends. JSON routes refuse bodies over 64 KB, and at most two password checks run at once.

Per-minute limits: uploads, previews, chat and street-name lookups are limited per signed-in account, not per network address, because every request reaches the Render container from Render's own proxy. Reports (`MAX_REPORTS_PER_DAY`, default 10) and added details (`MAX_ADDENDA_PER_DAY`, default 20) are also capped per resident per 24 hours in the database, so a restart does not reset them. Login is limited per email and address (10 a minute), per email (50) and per address (60). Until `TRUSTED_PROXY_HOPS` is set, every caller behind a proxy shares one address, so per-address limits become one shared limit ten times looser, and the login limit per email and address is skipped. A stranger can still use up the 50-a-minute limit on one email. Each new chain length logs `X-Forwarded-For has N entries`: load the site normally, read the Render log and set `TRUSTED_PROXY_HOPS` to the smallest N logged, since a client can add entries but not remove them. Do not use uvicorn's `--forwarded-allow-ips="*"`, which trusts the leftmost, client-written entry.

Face blurring needs `opencv-python-headless` 4.13 (in `deploy/requirements-render-vision.txt`) and the YuNet model in `apps/api/models/yunet` (MIT; the image checks its hash). Measured once on 3 November on a Windows desktop on one thread, not on Render: three detection passes on a 1,600 × 1,200 photo took about 270 ms, against about 103 ms for the Haar cascade it replaced. Peak memory in that process was 156 MB against 111 MB, settling at 66 MB against 108 MB. Render Free's CPU share is unmeasured, and `deploy/verify-render-ai.py` neither checks blurring nor times it alone, so time an upload on the hosted plan. The image build fails if OpenCV cannot load the model. Set `FACE_BLUR=off` if uploads become too slow on the hosted plan. A model card on a mirror lists the training set, WIDER FACE, as CC BY-NC-ND; the weights are MIT, but review that if the project ever becomes commercial.

The category checker's weights are labelled research-use only (`apps/api/models/mobileclip2-s0/checker.json`). On 3 November 2026 the owner chose to keep them for now and review Apple's terms, so that decision stays open while the site is public.

Images are sanitized before upload. The backend rejects a public bucket and authorizes every image response. Supabase secrets never enter the browser. Review [deletion and backup handling](data-deletion.md), approve a retention policy before using real resident data, and back up Storage objects separately from database backups. Image storage and database writes are not an atomic cross-service transaction; failed cleanup logs a report identifier for operator reconciliation.

Local images are not copied automatically to Supabase; migrate and verify any existing real data before changing storage settings.

## Staff jurisdiction

Staff are limited to one barangay once the first barangay is loaded. Until then all staff see all reports. The load needs an administrator account, because only administrators see reports outside every boundary. Work from a trusted terminal connected to the database, inside `apps/api`, and preview first:

```bash
python -m barangai.barangays data/dasmarinas-barangays.geojson --dry-run
```

```bash
python -m barangai.barangays data/dasmarinas-barangays.geojson
```

```bash
python -m barangai.bootstrap_staff staff@example.test --barangay "Barangay name"
```

```bash
python -m barangai.bootstrap_staff staff@example.test --barangay "Other barangay" --assign
```

`apps/api/data/dasmarinas-barangays.geojson` holds the 75 barangays of Dasmariñas, and `taft-barangays.geojson` the 13 barangays around DLSU Taft in Manila, from the same source. Their names and codes are matched to PSGC 3Q 2026, and the shapes are NAMRIA and PSA's, from OCHA's COD-AB release of November 2023 (CC BY-IGO), through [philippines-psgc-shapefiles](https://github.com/faeldon/philippines-psgc-shapefiles) v1.0.0 (MIT). The maps credit NAMRIA, PSA and OCHA, so keep that credit. These shapes are for service areas and aren't a legal boundary. `apps/api/tools/export_boundaries.py` rebuilds the file from that release's barangay zip. To cover demos at DLSU Taft, also run `python -m barangai.barangays data/taft-barangays.geojson`, then `python -m barangai.bootstrap_staff staff@demo.test --barangay "Barangay 719" --assign` if the staff account should see pins on campus.

The licence terms are in `apps/api/data/NOTICE.md`. The credit on the maps names this source, so a file from another source needs its own credit there, such as OpenStreetMap contributors (ODbL).

A boundary file is a GeoJSON Feature or FeatureCollection of Polygons or MultiPolygons, each with a `name` in `properties`. Loading a name that already exists replaces its boundary. Reports with no barangay are placed at that point; a load never moves reports that already have one.

**Assign existing staff straight after the first load:** until they have a barangay, they see no reports.

There is no undo command yet. A wrong load needs a reviewed database change that clears `barangay_id` on `reports` and `users` and then empties `barangays`. Downgrading past migration `0009`, or rolling back to an image older than it, turns enforcement off, and all staff see all reports again.

`seed_demo` doesn't assign barangays. After a load, seeded staff see nothing until assigned, and reports seeded after it have no barangay until the import runs again.
