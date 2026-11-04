# BarangAI

Community incident reporting for Philippine barangays. Residents submit photographed, located concerns; barangay staff verify and manage them. No report is forwarded automatically. BarangAI is an early-stage product with no customers yet. See [feature status](docs/feature-status.md), the [mobile guide](docs/mobile.md) for running it, the [backlog](docs/backlog.md) and the [business model](docs/business-model.md).

## Current state

The local application includes resident, staff and administrator permissions, private sanitized photo uploads, ownership checks, status transitions, actions and audit history. Residents can choose an existing photo or use a camera input, preview the selection and submit it. After a photo is chosen, the AI fills in the category, a short description, hazard flags and the location (see [Running with AI](#running-with-ai)); residents review and edit all of it, and staff verify every report. Its accuracy has not been measured yet, and embedding quality for duplicate review is not validated. Chat supports English, Filipino and Taglish with authorized tracking and optional Workers AI guidance.

The staff portal includes filters, category counts, a 14-day trend, an incident map and a monthly report with a spreadsheet download and print view. In-app notifications record status changes and read/unread state. The interface supports English and Filipino. Resident Google sign-in is implemented and hidden until credentials are configured. The administrator [deletion command](docs/data-deletion.md) defaults to a dry run and requires explicit confirmation.

BarangAI runs locally: a laptop serves the website and API, staff use its browser, and residents use an Android app over the same Wi-Fi. See [Running on a laptop and an Android phone](docs/mobile.md). The Render and Supabase files and guides are parked and not in use.

## Local setup

Use Python 3.12 and Node.js 22. The local database is SQLite; nothing else needs installing. Copy [`.env.example`](.env.example) to `.env` for optional keys and keep it out of Git. Do not use real resident information in tests or demos.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c deploy/constraints-render.txt -e './apps/api[test,ai]'
cd apps/api
$env:COOKIE_SECURE = 'false'
python -m barangai.bootstrap_staff admin@example.test --role administrator
# Optional: load barangays, then give staff --barangay "<name>". See docs/deployment.md.
# python -m barangai.barangays data/dasmarinas-barangays.geojson
python -m uvicorn barangai.main:app --host 127.0.0.1 --port 8000
```

The database and photos live in `barangai-dev.db` and `private_media/` at the repo root, whichever folder you run from. The server won't start without OpenCV for blurring, which the `ai` extra installs, unless you set `FACE_BLUR=off` and `PLATE_BLUR=off` on purpose; tests do this themselves.

In another terminal:

```powershell
cd apps/web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to local FastAPI. Create a resident account in the browser. Staff accounts are created only through the CLI. The PostgreSQL and Supabase paths are parked until deployment.

## Verification commands

```powershell
python -m pytest apps/api/tests -q --basetemp apps/api/.pytest_tmp
cd ml; python -m pytest tests -q --basetemp=.pytest_tmp
cd ../apps/web; npm test; npm run build
```

## Running with AI

The report AI has two parts. A Cloudflare Workers AI vision model reads the cleaned photo and fills in the category, a short description and hazard flags. A MobileCLIP2-S0 checker ([apps/api/models/mobileclip2-s0](apps/api/models/mobileclip2-s0), Apple research-only licence) runs locally on ONNX Runtime, cross-checks the category and stands in when Cloudflare is unavailable. Location comes from the photo's GPS, then the phone's, with street names from OpenStreetMap.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c deploy/constraints-render.txt -e './apps/api[test,ai]'
cd apps/web
npm ci
npm run build
cd ../..
.\deploy\start-local.ps1
```

Open `http://127.0.0.1:8000`. The launcher serves the built website and API together and always uses the local SQLite database and private image folder. For Cloudflare descriptions, put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_TOKEN` in the git-ignored `.env` file at the repo root (see [`.env.example`](.env.example)); the launcher reads only those keys, the Google ones and `GEOCODER_CONTACT`, and prints whether Cloudflare is on. Without them only the checker runs. Use `-Port 8001` if port 8000 is busy.

The checker's 0.5 cutoff and prompts are untuned, and no accuracy has been measured yet. Residents review and edit every suggestion; staff verify every report. To compare the Cloudflare models and tune the checker on labelled photos, see [apps/api/tools/evaluate_ai.py](apps/api/tools/evaluate_ai.py).

The old classifier in `ml/` is frozen and unused; see [`ml/README.md`](ml/README.md). The [evaluation pack](docs/evaluation.md) contains blank tasks, questionnaires and technical cases for testing with real users. Field evaluation in the Philippines is still outstanding.
