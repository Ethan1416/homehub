# Claude Code status hook (Windows PowerShell). For Justin's PC.
# Usage in settings.json: powershell -File homehub-hook.ps1 -Mode start|stop
# Config: %USERPROFILE%\.config\homehub\env.ps1  (sets $HOMEHUB_FN_URL/$HOMEHUB_SECRET/$HOMEHUB_MACHINE)
param([string]$Mode = "stop")
$ErrorActionPreference = "SilentlyContinue"

$cfg = Join-Path $env:USERPROFILE ".config\homehub\env.ps1"
if (Test-Path $cfg) { . $cfg }
if (-not $HOMEHUB_FN_URL -or -not $HOMEHUB_SECRET -or -not $HOMEHUB_MACHINE) { exit 0 }

$raw = [Console]::In.ReadToEnd()
try { $d = $raw | ConvertFrom-Json } catch { $d = $null }
$cwd = if ($d.cwd) { $d.cwd } else { "" }
$proj = if ($cwd) { Split-Path $cwd -Leaf } else { "-" }
$prompt = if ($d.prompt) { ($d.prompt -replace "`r?`n", " ").Trim() } else { "-" }
if ($prompt.Length -gt 160) { $prompt = $prompt.Substring(0, 160) }

if ($Mode -eq "start") {
  $payload = @{ machine = $HOMEHUB_MACHINE; state = "working"; project = $proj; last_task = $prompt }
} else {
  $payload = @{ machine = $HOMEHUB_MACHINE; state = "idle" }
}

try {
  Invoke-RestMethod -Uri $HOMEHUB_FN_URL -Method Post -TimeoutSec 4 `
    -Headers @{ "x-homehub-secret" = $HOMEHUB_SECRET } `
    -ContentType "application/json" -Body ($payload | ConvertTo-Json -Compress) | Out-Null
} catch {}
exit 0
