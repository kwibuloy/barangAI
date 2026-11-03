"""PreToolUse: deny secret/model access; ask before git commit/push or deploys (AGENTS.md)."""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path(__file__).resolve().parents[2])).resolve()
SECRET_ARG = re.compile(r"""(?:^|[\s'"=/\\])(?:\.env(?:\.(?!example\b)[\w.-]+)?|(?:\./|\.\\)?env)(?=$|[\s'";|&)])""")
FROZEN = {"apps/api/barangai/inference.py", "apps/api/barangai/duplicates.py"}
PROGRAM_ENV = re.compile(r"(?:^|[;&|]\s*)env\b")
PUBLISH = re.compile(
    r"\bgit\b[^;&|\n]*\s(?:commit|push)\b|\bgh\s+pr\s+(?:create|merge)\b|\b(?:render|vercel)\b.*\bdeploy\b|\bvercel\b.*--prod"
)


def decide(decision, reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": decision,
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


def is_secret(rel):
    name = rel.name
    return rel.as_posix() == "env" or (name.startswith(".env") and name != ".env.example")


def check_path(raw, writing):
    path = Path(raw)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return
    if is_secret(rel):
        decide("deny", f"{rel.as_posix()} holds secrets; ask the user for the specific value you need.")
    if writing and (rel.parts[:1] in {("models",), ("ml",)} or rel.as_posix() in FROZEN):
        decide("deny", f"{rel.as_posix()} is part of the frozen classifier/duplicate work (AGENTS.md).")


event = json.load(sys.stdin)
tool, data = event.get("tool_name", ""), event.get("tool_input", {})
if tool in {"Bash", "PowerShell"}:
    command = data.get("command", "")
    if SECRET_ARG.search(PROGRAM_ENV.sub(" ", command)):
        decide("deny", "The command touches an env file with secrets; ask the user instead.")
    if PUBLISH.search(command):
        decide("ask", "Commit, push and deploy need the user's direct request (AGENTS.md).")
elif data.get("file_path") or data.get("path"):
    check_path(data.get("file_path") or data["path"], tool in {"Edit", "Write", "NotebookEdit"})
