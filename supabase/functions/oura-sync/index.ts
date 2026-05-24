// Pulls last 14 days from Oura and upserts public.health_daily.
// Secured by x-homehub-secret (matches HOMEHUB_INGEST_SECRET). Token in
// HOMEHUB_OURA_TOKEN. Scheduled via pg_cron + pg_net.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-homehub-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const OURA = 'https://api.ouraring.com/v2/usercollection'

async function ouraGet(token: string, path: string) {
  const r = await fetch(`${OURA}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!r.ok) throw new Error(`Oura ${path} ${r.status}`)
  return await r.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (req.headers.get('x-homehub-secret') !== Deno.env.get('HOMEHUB_INGEST_SECRET')) {
    return new Response('forbidden', { status: 403, headers: cors })
  }
  const token = Deno.env.get('HOMEHUB_OURA_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ error: 'no oura token' }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' }
    })
  }

  const today = new Date()
  const start = new Date(today); start.setDate(start.getDate() - 14)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const range = `start_date=${fmt(start)}&end_date=${fmt(today)}`

  try {
    const [readi, slp, act, sessions] = await Promise.all([
      ouraGet(token, `daily_readiness?${range}`),
      ouraGet(token, `daily_sleep?${range}`),
      ouraGet(token, `daily_activity?${range}`),
      // sleep sessions give us total_sleep_duration, average_hrv, average_heart_rate
      ouraGet(token, `sleep?${range}`)
    ])

    // Index by day. For sleep sessions take the longest one of the night
    // (the actual main sleep).
    const byDay: Record<string, any> = {}
    const put = (d: string) => (byDay[d] ||= { day: d, raw: {} })

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
    // For each day, pick the longest sleep session
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

    const rows = Object.values(byDay).map((r: any) => ({
      ...r,
      updated_at: new Date().toISOString()
    }))

    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const up = await fetch(
      `${url}/rest/v1/health_daily?on_conflict=day`,
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
    if (!up.ok) {
      return new Response(await up.text(), { status: 500, headers: cors })
    }
    return new Response(JSON.stringify({ inserted: rows.length, days: rows.map((r:any)=>r.day) }), {
      headers: { ...cors, 'content-type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})
