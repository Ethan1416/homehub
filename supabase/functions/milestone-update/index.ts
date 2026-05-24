// Update a milestone row. Secured by x-homehub-secret. Used by hooks/CLI.
// Body: { id: string, status?: 'pending'|'active'|'done', title?, description? }
// Special: setting status=active will demote any currently-active rows.

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

  let body: any
  try { body = await req.json() } catch { return new Response('bad json', { status: 400, headers: cors }) }
  if (!body?.id || typeof body.id !== 'string') {
    return new Response('id required', { status: 400, headers: cors })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = { apikey: key!, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status && ['pending', 'active', 'done'].includes(body.status)) patch.status = body.status
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200)
  if (typeof body.description === 'string') patch.description = body.description.slice(0, 600)

  // If promoting one to active, demote others first
  if (patch.status === 'active') {
    await fetch(`${url}/rest/v1/milestones?status=eq.active&id=neq.${encodeURIComponent(body.id)}`, {
      method: 'PATCH',
      headers: { ...auth, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pending', updated_at: new Date().toISOString() })
    })
  }

  const r = await fetch(`${url}/rest/v1/milestones?id=eq.${encodeURIComponent(body.id)}`, {
    method: 'PATCH',
    headers: { ...auth, Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  })
  if (!r.ok) return new Response(await r.text(), { status: 500, headers: cors })
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, 'content-type': 'application/json' }
  })
})
