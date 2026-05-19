# Justin's PC — Claude status hook setup (Windows)

This makes Justin's Claude Code activity show on the HomeHub TV.
Ethan will give you the real `HOMEHUB_SECRET` value separately (it is intentionally
NOT in this public repo).

## 1. Get the repo
Clone or download this repo somewhere, e.g. `C:\Users\Justin\homehub`.

## 2. Create the config file
Create `%USERPROFILE%\.config\homehub\env.ps1` with:

```powershell
$HOMEHUB_FN_URL = "https://kiuxegztynurpthxsnvr.supabase.co/functions/v1/claude-status"
$HOMEHUB_SECRET = "<paste the secret Ethan sends you>"
$HOMEHUB_MACHINE = "pc"
```

## 3. Register the hooks
Merge this into `%USERPROFILE%\.claude\settings.json` (create the file if missing;
keep any existing keys). Adjust the path if you cloned elsewhere:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "powershell -NoProfile -File C:\\Users\\Justin\\homehub\\hooks\\homehub-hook.ps1 -Mode start" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "powershell -NoProfile -File C:\\Users\\Justin\\homehub\\hooks\\homehub-hook.ps1 -Mode stop" } ] }
    ]
  }
}
```

## 4. Test
In any folder, run a quick Claude Code prompt. Within ~2s the HomeHub TV's
"Justin's PC" card should flip to **Working**, then **Idle** when it finishes.
