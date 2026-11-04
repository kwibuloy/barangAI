---
name: seed-demo
description: Fill a local BarangAI database with synthetic accounts and reports across every status, for demos, screenshots and UI work.
---

Run `python -m alembic upgrade head`, then `python -m barangai.seed_demo [--count 12]`, from `apps/api` with the project venv. Point `DATABASE_URL` and `PRIVATE_MEDIA_DIR` at local paths (the default is `sqlite:///./barangai-dev.db`) and leave `MEDIA_STORAGE=local`.

- It creates `staff@demo.test`, `admin@demo.test`, `resident1@demo.test` and `resident2@demo.test`. Each role has its own password (at least 12 characters): residents from `SEED_DEMO_PASSWORD` or a prompt, staff from `SEED_DEMO_STAFF_PASSWORD`, the administrator from `SEED_DEMO_ADMIN_PASSWORD`. A staff or administrator password left unset is generated and printed once. Generate all three yourself, keep them set for `shoot.mjs`, and don't echo them back in chat. Tell the user to read them from their terminal, or to set them themselves.
- A database with `@demo.test` staff or administrator accounts makes `deploy/start-local.ps1 -Lan` refuse to start unless `-Demo` is passed.
- Reports use plain synthetic photos, coordinates near one synthetic point and the API's `CATEGORIES`, and they follow `workflow.NEXT` (including one Rejected path) with events, notifications and staff actions.
- Running it again adds more reports and reuses the existing accounts.
- It refuses a non-local database or Supabase storage unless `--allow-remote` is passed. Don't pass that flag without the user's direct approval for that target.
