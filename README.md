# BarangAI

Community incident reporting for Philippine barangays. Residents submit photographed, located concerns; barangay staff verify and manage them. No report is forwarded automatically. See the [presentation guide](docs/presentation-demo.md), [feature status](docs/feature-status.md), and [deployment guide](docs/deployment.md) for capabilities and remaining gates.

## Current state

The local application includes resident, staff and administrator permissions, private sanitized photo uploads, ownership checks, status transitions, actions and audit history. Residents can choose an existing photo or use a camera input, preview the selection and submit it. After a photo is chosen, the AI fills in the category, a short description, hazard flags and the location (see [Local presentation with AI](#local-presentation-with-ai)); residents review and edit all of it, and staff verify every report. Its accuracy has not been measured yet, and embedding quality for duplicate review is not validated. Chat supports English, Filipino and Taglish with authorized tracking and optional Workers AI guidance. The public demo is [BarangAI](https://barangai-watch.onrender.com). The reviewed AI image was deployed on 21 October 2026; three authenticated synthetic photo previews returned predictions successfully.

The staff portal includes filters, category counts, a seven-day trend and an incident map. In-app notifications record status changes and read/unread state. The interface supports English and Filipino. Resident Google sign-in is implemented and hidden until credentials are configured. The administrator [deletion command](docs/data-deletion.md) defaults to a dry run and requires explicit confirmation.

The selected hosting setup is **Render Free + Supabase Free**. One container serves the website and API; PostgreSQL and a private photo bucket persist separately. Local storage remains available for development. Hosted privacy checks, physical-phone camera checks and target-host performance must pass before claiming the hosted demo ready.

## Local setup

Use Python 3.12, Node.js 22, and PostgreSQL. Copy [`.env.example`](.env.example) into your local environment, fill `DATABASE_URL`, and keep it out of Git. For local HTTP only, set `COOKIE_SECURE=false`; production defaults to a secure cookie. Store `PRIVATE_MEDIA_DIR` outside any public web root. Do not use real resident information in tests or demos.

```powershell
cd apps/api
python -m pip install -e '.[test]'
$env:DATABASE_URL = 'postgresql+psycopg2://USER:PASSWORD@localhost/barangai'
alembic upgrade head
python -m barangai.bootstrap_staff staff@example.test --role staff
# Optional: load barangays. This needs an administrator (--role administrator), and staff then need --barangay "<name>". See docs/deployment.md.
# python -m barangai.barangays data/dasmarinas-barangays.geojson
uvicorn barangai.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd apps/web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to local FastAPI. Create a resident account in the browser. Staff accounts are created only through the CLI. Local development may use SQLite (`DATABASE_URL=sqlite:///./barangai-dev.db`) for quick checks, but PostgreSQL is the intended deployed database.

## Verification commands

```powershell
python -m pytest apps/api/tests -q --basetemp apps/api/.pytest_tmp
cd ml; python -m pytest tests -q --basetemp=.pytest_tmp
cd ../apps/web; npm test; npm run build
```

## Local presentation with AI

The report AI has two parts. A Cloudflare Workers AI vision model reads the cleaned photo and fills in the category, a short description and hazard flags. A MobileCLIP2-S0 checker ([apps/api/models/mobileclip2-s0](apps/api/models/mobileclip2-s0), Apple research-only licence) runs locally on ONNX Runtime, cross-checks the category and stands in when Cloudflare is unavailable. Location comes from the photo's GPS, then the phone's, with street names from OpenStreetMap.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e './apps/api[test,ai]'
cd apps/web
npm ci
npm run build
cd ../..
.\deploy\start-local.ps1
```

Open `http://127.0.0.1:8000`. The launcher serves the built website and API together and always uses the local SQLite database and private image folder. For Cloudflare descriptions, put `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_TOKEN` in the git-ignored `.env` file at the repo root (see [`.env.example`](.env.example)); the launcher reads only those keys, the Google ones and `GEOCODER_CONTACT`, and prints whether Cloudflare is on. Without them only the checker runs. Use `-Port 8001` if port 8000 is busy.

The checker's 0.5 cutoff and prompts are untuned, and no accuracy has been measured yet. Residents review and edit every suggestion; staff verify every report. To compare the Cloudflare models and tune the checker on labelled photos, see [apps/api/tools/evaluate_ai.py](apps/api/tools/evaluate_ai.py).

For ML data, rights and commands, see [`ml/README.md`](ml/README.md). The [evaluation pack](docs/evaluation.md) contains blank participant tasks, questionnaires and technical cases. Publishing needs the intended Git repository, Render/Supabase access and explicit authorization. Deployment-host measurements and independent Philippine evaluation remain outstanding.
