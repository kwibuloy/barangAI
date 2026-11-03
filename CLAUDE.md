@AGENTS.md

AGENTS.md is the memory vault: record durable rules and decisions there by editing existing lines, not by adding to this file.

- Hooks: `.claude/settings.json` → `.claude/hooks/` (secret/model guard, git-publish guard, format on edit, checks on stop)
- Agents: `.claude/agents/` — `rules-reviewer` (any diff, before calling work done), `ui-critic` (screenshots)
- Skills: `/verify`, `/migration`, `/seed-demo`, `/visual-check` (screenshots of touched routes, via `apps/web/scripts/shoot.mjs`), `ui-ux-pro-max` (design data; installed by `npx ui-ux-pro-max-cli init --ai claude`) in `.claude/skills/`
- Mascot: `apps/web/scripts/kap.py` cuts Kap poses from the user's artwork into `apps/web/src/assets/kap/`
- Code: `apps/api` (FastAPI; report AI in `barangai/ai.py`, `vision.py`, `checker.py`, `geo.py`), `apps/api/models/` + `apps/api/tools/` (checker model, export, evaluation), `apps/web` (Vite React), `ml/` + `models/` (old classifier, frozen), `deploy/` (Render)
- Docs: `docs/architecture.md`, `docs/api.md`, `docs/feature-status.md`, `docs/deployment.md`
