#!/usr/bin/env node
// End-to-end test of the interactive widget done/skip flow.
// Simulates exactly what tapping ✓ or ↷ does on the home screen:
//   1. Compute the current widget's "next" pick
//   2. Fire the same Supabase upsert the widget URL would trigger
//   3. Re-fetch and show the NEW "next" pick (should have advanced)
//   4. CLEAN UP — revert the test row so your real data isn't polluted

const USER = 'ethan'
const SUPABASE_URL = 'https://kiuxegztynurpthxsnvr.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpdXhlZ3p0eW51cnB0aHhzbnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTgxODksImV4cCI6MjA5NDc3NDE4OX0.XLYO2XCmXtfQvzD1tJGgdYZrqmMSBzsQBnXXZfz31ss'

const action = process.argv[2] || 'done'   // 'done' | 'skip'
if (!['done', 'skip'].includes(action)) {
  console.error('Usage: node widgets/test-interactive.mjs [done|skip]'); process.exit(1)
}

const baseHeaders = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
async function sb(path, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params ? '?' + params : ''}`, { headers: baseHeaders })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}
async function upsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/progress?on_conflict=event_id,log_date,item_key,user_id`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row)
  })
  if (!r.ok) throw new Error(`upsert: ${r.status} ${await r.text()}`)
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isExercise = (l) => /^\d+[.)]\s/.test(l)
function setCount(line) {
  const clamp = (n) => Math.min(Math.max(n, 1), 8)
  let m
  if ((m = line.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})\s*sets?\b/i))) return clamp(parseInt(m[2], 10))
  if ((m = line.match(/(\d{1,2})\s*sets?\s*[×xX]/i))) return clamp(parseInt(m[1], 10))
  if ((m = line.match(/[—-]\s*(\d{1,2})\s*[×xX]\s*\d/))) return clamp(parseInt(m[1], 10))
  if ((m = line.match(/\b(\d{1,2})\s*[×xX]\s*\d/))) return clamp(parseInt(m[1], 10))
  if ((m = line.match(/(\d{1,2})\s*sets?\b/i))) return clamp(parseInt(m[1], 10))
  return 3
}
function parseEvent(ev) {
  const lines = (ev.notes || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const titleGym = /gym|🏋/i.test(ev.title || '')
  if (lines.some(isExercise) || (titleGym && lines.length)) {
    const groups = []
    lines.forEach((l) => { if (isExercise(l)) groups.push({ key: `g${groups.length}`, label: l, sets: setCount(l) }) })
    return { kind: 'gym', groups }
  }
  if (lines.length) {
    const parts = lines.join(' / ').split(/(?<=[.;])\s+|\s*\/\s*|\s•\s/)
      .map((s) => s.replace(/[.;]\s*$/, '').trim()).filter((s) => s.length > 1)
    return { kind: 'meal', groups: parts.map((p, i) => ({ key: `m${i}`, label: p, sets: 0 })) }
  }
  return { kind: 'simple', groups: [{ key: '__done__', label: ev.title, sets: 0 }] }
}
const stripNum = (l) => l.replace(/^\d+\.\s*/, '').split('—')[0].trim()
const occursOn = (ev, d) => {
  const s = new Date(ev.starts_at)
  if (ev.recurrence === 'daily') return s <= d
  if (ev.recurrence === 'weekly') return s <= d && s.getDay() === d.getDay()
  return ymd(s) === ymd(d)
}

async function loadNext() {
  const today = new Date()
  const dayKey = ymd(today)
  const [events, progress, overrides] = await Promise.all([
    sb('events', 'select=*'),
    sb('progress', `select=*&log_date=eq.${dayKey}&user_id=eq.${USER}`),
    sb('gym_override', `select=*&log_date=eq.${dayKey}&user_id=eq.${USER}`)
  ])
  const ovId = overrides[0]?.event_id
  const ovEv = ovId ? events.find((e) => e.id === ovId) : null
  let todays = events.filter((e) => occursOn(e, today))
  if (ovEv) todays = todays.filter((e) => e.type !== 'gym').concat([ovEv])
  todays.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  const byEvent = {}
  for (const r of progress) ((byEvent[r.event_id] ||= {}))[r.item_key] = r
  const moved = (r) => !!(r && (r.done || r.skipped))
  for (const e of todays) {
    const p = parseEvent(e)
    const pd = byEvent[e.id] || {}
    for (const g of p.groups) {
      if (g.sets > 0) {
        for (let s = 0; s < g.sets; s++) {
          const k = `${g.key}#${s}`
          if (!moved(pd[k])) return { event: e, label: stripNum(g.label), itemKey: k, setNum: s + 1, totalSets: g.sets, dayKey, prevRow: pd[k] || null }
        }
      } else if (!moved(pd[g.key])) {
        return { event: e, label: g.label, itemKey: g.key, setNum: 0, totalSets: 0, dayKey, prevRow: pd[g.key] || null }
      }
    }
  }
  return null
}

const labelFor = (n) => n ? `${n.event.title} → ${n.label}${n.totalSets ? ` (set ${n.setNum}/${n.totalSets})` : ''} [${n.itemKey}]` : '(all moved past)'

console.log(`\n▶ Testing interactive widget — action: ${action.toUpperCase()}`)
console.log(`User: ${USER}`)

const before = await loadNext()
console.log(`\nBEFORE — widget shows: ${labelFor(before)}`)
if (!before) { console.log('Nothing to test against.'); process.exit(0) }

console.log(`\n→ Firing simulated tap: ${action.toUpperCase()} on ${before.itemKey}`)
await upsert({
  event_id: before.event.id, log_date: before.dayKey, item_key: before.itemKey,
  user_id: USER, updated_at: new Date().toISOString(),
  done: action === 'done', skipped: action === 'skip'
})
console.log('  ✓ Supabase upsert succeeded')

const after = await loadNext()
console.log(`\nAFTER — widget shows:  ${labelFor(after)}`)

// CLEAN UP — revert so we don't pollute real data.
console.log(`\n↩ Cleaning up: reverting ${before.itemKey} to its previous state...`)
if (before.prevRow) {
  await upsert({
    event_id: before.event.id, log_date: before.dayKey, item_key: before.itemKey,
    user_id: USER, updated_at: new Date().toISOString(),
    done: before.prevRow.done || false, skipped: before.prevRow.skipped || false
  })
  console.log(`  ✓ Restored prior state (done=${before.prevRow.done}, skipped=${before.prevRow.skipped})`)
} else {
  // No prior row → delete the test row entirely
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/progress?event_id=eq.${before.event.id}&log_date=eq.${before.dayKey}&item_key=eq.${encodeURIComponent(before.itemKey)}&user_id=eq.${USER}`,
    { method: 'DELETE', headers: baseHeaders }
  )
  console.log(`  ✓ Deleted test row (HTTP ${r.status})`)
}

console.log(`\n✅ Test complete. The widget would advance from\n   ${before.label} → ${after ? after.label : '(end)'}\nwhen you tap ${action === 'done' ? '✓' : '↷'} on your phone.\n`)
