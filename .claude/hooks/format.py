"""PostToolUse: format the edited file with ruff (Python) or prettier (web). Skips tools that are not installed."""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path(__file__).resolve().parents[2])).resolve()
WEB = ROOT / "apps/web"
PRETTIER = WEB / "node_modules/prettier/bin/prettier.cjs"
VENV = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
PYTHON = str(VENV) if VENV.exists() else sys.executable

path = Path(json.load(sys.stdin).get("tool_input", {}).get("file_path", "")).resolve()
if (
    not path.is_file()
    or ROOT not in path.parents
    or ROOT / "ml" in path.parents
    or ROOT / "models" in path.parents
    or path.name in {"inference.py", "duplicates.py"}
):
    sys.exit(0)
if path.suffix == ".py":
    for args in (["format", "--quiet"], ["check", "--fix", "--quiet"]):
        subprocess.run([PYTHON, "-m", "ruff", *args, str(path)], cwd=ROOT / "apps/api", capture_output=True)
elif WEB in path.parents and path.suffix in {".ts", ".tsx", ".mjs", ".css", ".json", ".html"} and PRETTIER.exists():
    subprocess.run(["node", str(PRETTIER), "--write", "--log-level", "warn", str(path)], cwd=WEB, capture_output=True)
