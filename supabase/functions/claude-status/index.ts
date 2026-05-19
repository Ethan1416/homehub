// Secured Claude-status ingest. No external imports (single-file deploy safe).
// Hook scripts POST here with header x-homehub-secret.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-homehub-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('method', { status: 405, headers: cors })

  if (req.headers.get('x-homehub-secret') !== Deno.env.get('HOMEHUB_INGEST_SECRET')) {
    return new Response('forbidden', { status: 403, headers: cors })
  }

  let body
  try { body = await req.json() } catch { return new Response('bad json', { status: 400, headers: cors }) }

  const machine = body.machine
  if (machine !== 'mac' && machine !== 'pc') {
    return new Response('bad machine', { status: 400, headers: cors })
  }

  const patch: Record<string, unknown> = {
    state: body.state === 'working' ? 'working' : 'idle',
    updated_at: new Date().toISOString()
  }
  if (typeof body.project === 'string') patch.project = body.project.slice(0, 200)
  if (typeof body.last_task === 'string') patch.last_task = body.last_task.slice(0, 500)

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const r = await fetch(`${url}/rest/v1/claude_status?machine=eq.${machine}`, {
    method: 'PATCH',
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(patch)
  })
  if (!r.ok) {
    return new Response(await r.text(), { status: 500, headers: cors })
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'content-type': 'application/json' }
  })
})
