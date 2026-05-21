#!/usr/bin/env bash
# Claude Code status hook (macOS/Linux). Registered for UserPromptSubmit + Stop.
# Usage in settings.json: homehub-hook.sh start | homehub-hook.sh stop
# Config: ~/.config/homehub/env  ->  HOMEHUB_FN_URL, HOMEHUB_SECRET, HOMEHUB_MACHINE
#
# Stop mode additionally scans the just-completed transcript for milestone
# markers like:   [milestone] <id> = done|active|pending
# and POSTs them to HOMEHUB_MILESTONE_URL (derived from HOMEHUB_FN_URL).
set -uo pipefail

CFG="${HOMEHUB_CONFIG:-$HOME/.config/homehub/env}"
[ -f "$CFG" ] && . "$CFG"
: "${HOMEHUB_FN_URL:?}"; : "${HOMEHUB_SECRET:?}"; : "${HOMEHUB_MACHINE:?}"
MILESTONE_URL="${HOMEHUB_MILESTONE_URL:-${HOMEHUB_FN_URL%/*}/milestone-update}"

MODE="${1:-stop}"
INPUT="$(cat || true)"

# Pull cwd + prompt + transcript_path out of stdin JSON.
read -r CWD PROMPT TRANSCRIPT <<EOF
$(printf '%s' "$INPUT" | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: d = {}
cwd = d.get("cwd") or ""
proj = cwd.rstrip("/").split("/")[-1] if cwd else ""
prompt = (d.get("prompt") or "").replace("\n", " ").strip()[:160]
tp = d.get("transcript_path") or ""
print(proj or "-", prompt or "-", tp or "-")
' 2>/dev/null || echo "- - -")
EOF

# ---- status update ----
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
curl -s -m 4 -X POST "$HOMEHUB_FN_URL" \
  -H "content-type: application/json" \
  -H "x-homehub-secret: $HOMEHUB_SECRET" \
  -d "$PAYLOAD" >/dev/null 2>&1 || true

# ---- milestone scan (Stop only) ----
if [ "$MODE" = "stop" ] && [ "$TRANSCRIPT" != "-" ] && [ -f "$TRANSCRIPT" ]; then
  # Find unique [milestone] <id> = <status> markers in the last assistant turn.
  python3 - "$TRANSCRIPT" "$MILESTONE_URL" "$HOMEHUB_SECRET" <<'PY' 2>/dev/null || true
import sys, json, re, urllib.request
path, url, secret = sys.argv[1], sys.argv[2], sys.argv[3]
text = ""
try:
  with open(path) as f:
    for line in f:
      try:
        m = json.loads(line)
        if m.get("type") == "assistant":
          c = m.get("message", {}).get("content", [])
          if isinstance(c, list):
            for p in c:
              if isinstance(p, dict) and p.get("type") == "text":
                text += p.get("text", "") + "\n"
          elif isinstance(c, str):
            text += c + "\n"
      except Exception: pass
except Exception: sys.exit(0)
seen = set()
for mt in re.finditer(r"\[milestone\]\s+([a-z0-9-]+)\s*=\s*(pending|active|done)\b", text, re.I):
  k = (mt.group(1).lower(), mt.group(2).lower())
  if k in seen: continue
  seen.add(k)
  body = json.dumps({"id": k[0], "status": k[1]}).encode()
  try:
    req = urllib.request.Request(url, data=body, method="POST",
      headers={"content-type":"application/json","x-homehub-secret":secret})
    urllib.request.urlopen(req, timeout=4)
  except Exception: pass
PY
fi

exit 0
