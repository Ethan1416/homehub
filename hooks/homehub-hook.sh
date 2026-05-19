#!/usr/bin/env bash
# Claude Code status hook (macOS/Linux). Registered for UserPromptSubmit + Stop.
# Usage in settings.json: homehub-hook.sh start | homehub-hook.sh stop
# Config: ~/.config/homehub/env  ->  HOMEHUB_FN_URL, HOMEHUB_SECRET, HOMEHUB_MACHINE
set -euo pipefail

CFG="${HOMEHUB_CONFIG:-$HOME/.config/homehub/env}"
[ -f "$CFG" ] && . "$CFG"
: "${HOMEHUB_FN_URL:?}"; : "${HOMEHUB_SECRET:?}"; : "${HOMEHUB_MACHINE:?}"

MODE="${1:-stop}"
INPUT="$(cat || true)"

# Pull cwd + prompt out of the hook's stdin JSON (python3 ships with macOS).
read -r CWD PROMPT <<EOF
$(printf '%s' "$INPUT" | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: d = {}
cwd = d.get("cwd") or ""
proj = cwd.rstrip("/").split("/")[-1] if cwd else ""
prompt = (d.get("prompt") or "").replace("\n", " ").strip()[:160]
print(proj or "-", prompt or "-")
' 2>/dev/null || echo "- -")
EOF

if [ "$MODE" = "start" ]; then
  PAYLOAD=$(python3 -c '
import json,sys
print(json.dumps({"machine":sys.argv[1],"state":"working","project":sys.argv[2],"last_task":sys.argv[3]}))
' "$HOMEHUB_MACHINE" "$CWD" "$PROMPT")
else
  PAYLOAD=$(python3 -c '
import json,sys
print(json.dumps({"machine":sys.argv[1],"state":"idle"}))
' "$HOMEHUB_MACHINE")
fi

# Fire-and-forget; never block or fail Claude Code.
curl -s -m 4 -X POST "$HOMEHUB_FN_URL" \
  -H "content-type: application/json" \
  -H "x-homehub-secret: $HOMEHUB_SECRET" \
  -d "$PAYLOAD" >/dev/null 2>&1 || true
exit 0
