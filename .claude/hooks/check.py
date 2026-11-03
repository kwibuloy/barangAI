"""Stop: when API or web files changed since the last pass, run their fast checks and block on failure."""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path(__file__).resolve().parents[2])).resolve()
STAMP = ROOT / ".claude/.last-check"
VENV = ROOT / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
PYTHON = str(VENV) if VENV.exists() else sys.executable
WEB = ROOT / "apps/web"

if json.load(sys.stdin).get("stop_hook_active"):
    sys.exit(0)
status = subprocess.run(
    ["git", "status", "--porcelain", "-uall", "--", "apps/api", "apps/web"], cwd=ROOT, capture_output=True, text=True
).stdout
files = sorted(line[3:].strip('"') for line in status.splitlines())
digest = hashlib.sha256()
for name in files:
    path = ROOT / name
    digest.update(name.encode() + (path.read_bytes() if path.is_file() else b""))
if not files or (STAMP.exists() and STAMP.read_text() == digest.hexdigest()):
    sys.exit(0)

checks = []
if any(name.startswith("apps/api/") for name in files):
    checks.append(
        (
            [
                PYTHON,
                "-m",
                "pytest",
                "apps/api/tests",
                "-x",
                "-q",
                "-p",
                "no:cacheprovider",
                "--basetemp",
                tempfile.mkdtemp(prefix="barangai-check-"),
            ],
            ROOT,
        )
    )
if any(name.startswith("apps/web/") for name in files) and (WEB / "node_modules").exists():
    checks.append((["node", "node_modules/typescript/bin/tsc", "--noEmit", "-p", "."], WEB))
    checks.append((["node", "node_modules/vitest/vitest.mjs", "run", "--maxWorkers=1", "--no-file-parallelism"], WEB))

for command, cwd in checks:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        output = (result.stdout + result.stderr).strip()[-3000:]
        print(json.dumps({"decision": "block", "reason": f"`{' '.join(command[:4])}` failed:\n{output}"}))
        sys.exit(0)
STAMP.write_text(digest.hexdigest())
