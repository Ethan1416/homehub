// Secured Claude-status ingest. Deploy:
//   supabase functions deploy claude-status --no-verify-jwt
//   supabase secrets set HOMEHUB_INGEST_SECRET=<random>
// The hook scripts POST here with header x-homehub-secret.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
  const state = body.state === 'working' ? 'working' : 'idle'

  const sb = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )

  const patch = { state, updated_at: new Date().toISOString() }
  if (typeof body.project === 'string') patch.project = body.project.slice(0, 200)
  if (typeof body.last_task === 'string') patch.last_task = body.last_task.slice(0, 500)

  const { error } = await sb.from('claude_status').update(patch).eq('machine', machine)
  if (error) return new Response(error.message, { status: 500, headers: cors })

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'content-type': 'application/json' }
  })
})
