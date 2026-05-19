# HomeHub

Real-time shared household dashboard: a custom calendar + live Claude Code status
for two machines. One web app, three faces:

- **`/`** — installable PWA for both phones (add/edit calendar, Claude status strip)
- **`/tv`** — large read-only dashboard for the TV (driven by a Chromecast/Fire Stick)
- Realtime sync via Supabase — changes appear on every screen in ~1–2s

**Live:** https://ethan1416.github.io/homehub/ — phone PWA · `/#/tv` — TV dashboard

## Stack
Vite + React + React Router (HashRouter) · Supabase (Postgres + Realtime + Edge
Function) · hosted free on GitHub Pages (`gh-pages` branch)

## Deploy a new build
```
npm run build
# publish dist/ to the gh-pages branch (see scripts/deploy-pages.sh)
```
Supabase project ref: `kiuxegztynurpthxsnvr` (org "HomeHub", Free plan).
Secrets live outside the repo: `~/.config/homehub/env` (Mac hook),
Supabase project secret `HOMEHUB_INGEST_SECRET` (Edge Function).

## Setup

### 1. Supabase
1. Create a new Supabase project (separate from any other project).
2. SQL editor → run `sql/01_schema.sql` then `sql/02_rls.sql`.
3. Deploy the secured status endpoint:
   ```
   supabase functions deploy claude-status --no-verify-jwt
   supabase secrets set HOMEHUB_INGEST_SECRET=<random-string>
   ```
4. From Project Settings → API copy the **Project URL** and **anon key**.

### 2. Web app
```
cp .env.example .env.local   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install && npm run dev
```
Deploy to Vercel with the same two env vars set.

### 3. Claude status hooks
On **each** machine create the config file:

macOS (Ethan) — `~/.config/homehub/env`:
```
HOMEHUB_FN_URL=https://<project>.supabase.co/functions/v1/claude-status
HOMEHUB_SECRET=<the HOMEHUB_INGEST_SECRET value>
HOMEHUB_MACHINE=mac
```
Windows (Justin) — `%USERPROFILE%\.config\homehub\env.ps1`:
```
$HOMEHUB_FN_URL = "https://<project>.supabase.co/functions/v1/claude-status"
$HOMEHUB_SECRET = "<the HOMEHUB_INGEST_SECRET value>"
$HOMEHUB_MACHINE = "pc"
```
Then merge `hooks/settings-snippet.json` into that machine's `~/.claude/settings.json`
(use the `.sh` commands on Mac, the PowerShell line on Windows), and
`chmod +x hooks/homehub-hook.sh` on Mac.

### 4. TV
Plug a Chromecast w/ Google TV or Fire TV Stick into the TV, open its browser to
`https://<your-vercel-domain>/tv`, set it as the start page / pin it. No login.
