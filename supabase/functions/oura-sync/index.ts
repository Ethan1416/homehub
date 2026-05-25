// Multi-user Oura sync. For every configured user (Ethan, Justin), fetch the
// last 14 days from the Oura API and upsert into public.health_daily tagged
// with the user_id. Each user's PAT lives in its own project secret.
//
// Secured by x-homehub-secret (matches HOMEHUB_INGEST_SECRET). Scheduled via
// pg_cron hourly + on-demand POSTs from the client when needed.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-homehub-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const OURA = 'https://api.ouraring.com/v2/usercollection'

// Add new household members by appending here; each row maps a user_id (used
// in health_daily.user_id) to the env var holding that person's PAT.
const USERS: { id: string; envVar: string }[] = [
  { id: 'ethan',  envVar: 'HOMEHUB_OURA_TOKEN' },
  { id: 'justin', envVar: 'HOMEHUB_OURA_TOKEN_JUSTIN' }
]

async function ouraGet(token: string, path: string) {
  const r = await fetch(`${OURA}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!r.ok) throw new Error(`Oura ${path} ${r.status}`)
  return await r.json()
}

async function syncUser(userId: string, token: string) {
  const today = new Date()
  const start = new Date(today); start.setDate(start.getDate() - 14)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const range = `start_date=${fmt(start)}&end_date=${fmt(today)}`

  const [readi, slp, act, sessions] = await Promise.all([
    ouraGet(token, `daily_readiness?${range}`),
    ouraGet(token, `daily_sleep?${range}`),
    ouraGet(token, `daily_activity?${range}`),
    ouraGet(token, `sleep?${range}`)
  ])

  const byDay: Record<string, any> = {}
  const put = (d: string) => (byDay[d] ||= { day: d, user_id: userId, raw: {} })

  for (const r of readi.data || []) {
    const row = put(r.day)
    row.readiness_score = r.score ?? null
    row.temp_deviation = r.temperature_deviation ?? null
    row.raw.readiness = r
  }
  for (const r of slp.data || []) {
    const row = put(r.day)
    row.sleep_score = r.score ?? null
    row.raw.daily_sleep = r
  }
  for (const r of act.data || []) {
    const row = put(r.day)
    row.activity_score = r.score ?? null
    row.steps = r.steps ?? null
    row.raw.activity = r
  }
  const bestSleep: Record<string, any> = {}
  for (const s of sessions.data || []) {
    const d = s.day
    if (!bestSleep[d] ||
        (s.total_sleep_duration || 0) > (bestSleep[d].total_sleep_duration || 0)) {
      bestSleep[d] = s
    }
  }
  for (const [d, s] of Object.entries(bestSleep)) {
    const row = put(d)
    row.total_sleep_seconds = (s as any).total_sleep_duration ?? null
    row.hrv_avg = (s as any).average_hrv ?? null
    row.resting_hr = (s as any).average_heart_rate ?? null
    row.raw.sleep_session = s
  }

  // Normalize: every row must have the same set of keys for PostgREST batch upsert.
  const FIELDS = ['readiness_score','sleep_score','activity_score',
    'total_sleep_seconds','hrv_avg','resting_hr','temp_deviation','steps']
  const rows = Object.values(byDay).map((r: any) => {
    const norm: any = {
      day: r.day, user_id: r.user_id,
      raw: r.raw || {}, updated_at: new Date().toISOString()
    }
    for (const f of FIELDS) norm[f] = r[f] ?? null
    return norm
  })
  if (rows.length === 0) return { user: userId, inserted: 0 }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const up = await fetch(
    `${url}/rest/v1/health_daily?on_conflict=day,user_id`,
    {
      method: 'POST',
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    }
  )
  if (!up.ok) throw new Error(`upsert ${up.status}: ${await up.text()}`)
  return { user: userId, inserted: rows.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (req.headers.get('x-homehub-secret') !== Deno.env.get('HOMEHUB_INGEST_SECRET')) {
    return new Response('forbidden', { status: 403, headers: cors })
  }

  const results: any[] = []
  for (const u of USERS) {
    const token = Deno.env.get(u.envVar)
    if (!token) { results.push({ user: u.id, skipped: 'no token' }); continue }
    try {
      results.push(await syncUser(u.id, token))
    } catch (e) {
      results.push({ user: u.id, error: String(e) })
    }
  }
  return new Response(JSON.stringify({ results }), {
    headers: { ...cors, 'content-type': 'application/json' }
  })
})
