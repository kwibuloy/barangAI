---
name: verify
description: Run BarangAI's full local verification (API tests, web tests, typecheck and production build) and report real results. Use before saying a change works or before a commit.
---

Run from the repo root and report each result exactly, including failure output. Don't summarize a failure as a pass.

1. API: `.venv/Scripts/python.exe -m pytest apps/api/tests -q -p no:cacheprovider --basetemp <scratch dir>`. Use a fresh basetemp each run, because Windows locks old ones.
2. Web (in `apps/web`): `npm test`, then `npm run build` (runs `tsc -b` first).
3. ML only if `ml/` changed: `cd ml; ../.venv/Scripts/python.exe -m pytest tests -q -p no:cacheprovider`.
4. Lint: `.venv/Scripts/python.exe -m ruff check apps/api` and `npx prettier --check src tests` in `apps/web`.

If `.venv` or `apps/web/node_modules` is missing, set them up first: `python -m venv .venv`, `.venv/Scripts/python.exe -m pip install -e "./apps/api[dev]"`, `npm ci` in `apps/web`. If Vite fails to load its config in a restricted shell, retry with `-- --configLoader runner`.

Then run the `rules-reviewer` agent on the diff. Passing tests don't cover AGENTS.md rules.
