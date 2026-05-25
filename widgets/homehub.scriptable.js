// HomeHub iOS Home-Screen Widget
// ──────────────────────────────
// Shows the next "not yet moved past" task for today (gym/meal/other).
// Done OR skipped items both count as "moved past", so the widget advances
// when you skip something.
//
// Install:
//   1. Install Scriptable (free, App Store).
//   2. New script → paste this whole file → name it "HomeHub".
//   3. Long-press home screen → + → Scriptable → small or medium → choose
//      "HomeHub" in the widget config, "When Interacting → Run Script".
//   4. Edit USER below to "ethan" or "justin".

// ── config ─────────────────────────────────────────────────────────────
const USER = 'ethan'                  // ← change to 'justin' if Justin installs it
const SUPABASE_URL = 'https://kiuxegztynurpthxsnvr.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpdXhlZ3p0eW51cnB0aHhzbnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTgxODksImV4cCI6MjA5NDc3NDE4OX0.XLYO2XCmXtfQvzD1tJGgdYZrqmMSBzsQBnXXZfz31ss'
const APP_URL = 'https://ethan1416.github.io/homehub/'

// ── tiny supabase helpers ──────────────────────────────────────────────
async function sb(path, params = '') {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}${params ? '?' + params : ''}`)
  req.headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  return req.loadJSON()
}

// ── checklist parsing (mirrored from src/lib/checklist.js) ─────────────
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
    const info = [], groups = []
    lines.forEach((l) => {
      if (isExercise(l)) groups.push({ key: `g${groups.length}`, label: l, sets: setCount(l) })
      else info.push(l)
    })
    return { kind: 'gym', info, groups }
  }
  if (lines.length) {
    const parts = lines.join(' / ').split(/(?<=[.;])\s+|\s*\/\s*|\s•\s/)
      .map((s) => s.replace(/[.;]\s*$/, '').trim()).filter((s) => s.length > 1)
    return { kind: 'meal', info: [], groups: parts.map((p, i) => ({ key: `m${i}`, label: p, sets: 0 })) }
  }
  return { kind: 'simple', info: [], groups: [{ key: '__done__', label: ev.title, sets: 0 }] }
}
const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()

// ── data load: today's events + progress ───────────────────────────────
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function occursOn(ev, d) {
  const dayKey = ymd(d)
  const start = new Date(ev.starts_at)
  if (ev.recurrence === 'daily') return start <= d
  if (ev.recurrence === 'weekly') return start <= d && start.getDay() === d.getDay()
  return ymd(start) === dayKey
}

async function loadNext() {
  const today = new Date()
  const todayKey = ymd(today)
  const [events, progress, overrides] = await Promise.all([
    sb('events', 'select=*'),
    sb('progress', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`),
    sb('gym_override', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`)
  ])
  // Apply gym override (one routine can be swapped for the day)
  const overrideId = overrides[0]?.event_id
  const overrideEv = overrideId ? events.find((e) => e.id === overrideId) : null

  let todaysEvents = events.filter((e) => occursOn(e, today))
  if (overrideEv) {
    // remove any gym-typed events from today, insert the override
    todaysEvents = todaysEvents.filter((e) => e.type !== 'gym').concat([overrideEv])
  }
  // sort by start time
  todaysEvents.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  // bucket progress by event
  const byEvent = {}
  for (const r of progress) {
    ((byEvent[r.event_id] ||= {}))[r.item_key] = r
  }
  const moved = (r) => !!(r && (r.done || r.skipped))
  function completion(parsed, p) {
    let done = 0, total = 0
    for (const g of parsed.groups) {
      if (g.sets > 0) {
        total += g.sets
        for (let s = 0; s < g.sets; s++) if (moved(p[`${g.key}#${s}`])) done++
      } else {
        total += 1
        if (moved(p[g.key])) done++
      }
    }
    return { done, total }
  }
  function firstOpen(parsed, p) {
    for (const g of parsed.groups) {
      if (g.sets > 0) {
        for (let s = 0; s < g.sets; s++) {
          if (!moved(p[`${g.key}#${s}`])) return { label: stripNum(g.label), setNum: s + 1, totalSets: g.sets }
        }
      } else if (!moved(p[g.key])) {
        return { label: g.label, setNum: 0, totalSets: 0 }
      }
    }
    return null
  }

  // Find next event with anything still open
  let next = null
  let totalDone = 0, totalAll = 0
  for (const e of todaysEvents) {
    const parsed = parseEvent(e)
    const p = byEvent[e.id] || {}
    const { done, total } = completion(parsed, p)
    totalDone += done; totalAll += total
    if (!next) {
      const open = firstOpen(parsed, p)
      if (open) {
        next = {
          event: e, parsed, open, done, total,
          startTime: new Date(e.starts_at)
        }
      }
    }
  }
  return { next, todayKey, totalDone, totalAll, eventCount: todaysEvents.length }
}

// ── widget rendering ───────────────────────────────────────────────────
function fmtTime(d) {
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12; if (h === 0) h = 12
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`
}

function buildWidget(state) {
  const w = new ListWidget()
  w.url = APP_URL
  w.backgroundColor = new Color('#0e1117')
  w.setPadding(14, 14, 14, 14)

  // Header
  const head = w.addStack()
  const h = head.addText('HOMEHUB')
  h.font = Font.boldSystemFont(10)
  h.textColor = new Color('#7c83a3')
  head.addSpacer()
  if (state.totalAll > 0) {
    const pct = head.addText(`${state.totalDone}/${state.totalAll}`)
    pct.font = Font.boldSystemFont(10)
    pct.textColor = new Color('#7c83a3')
  }
  w.addSpacer(6)

  if (!state.next) {
    if (state.eventCount === 0) {
      const t = w.addText('Nothing scheduled today.')
      t.font = Font.systemFont(13)
      t.textColor = new Color('#a8afc7')
    } else {
      const t = w.addText('All done for today 🎉')
      t.font = Font.boldSystemFont(15)
      t.textColor = new Color('#5fd0a0')
      w.addSpacer(4)
      const sub = w.addText(`${state.totalAll}/${state.totalAll} moved past`)
      sub.font = Font.systemFont(11)
      sub.textColor = new Color('#7c83a3')
    }
    return w
  }

  // Event title
  const { event, open, done, total, startTime } = state.next
  const title = w.addText(event.title)
  title.font = Font.boldSystemFont(15)
  title.textColor = new Color('#e8ebf5')
  title.lineLimit = 1

  // Next task line
  w.addSpacer(4)
  const taskText = open.totalSets > 0
    ? `Next: ${open.label} — set ${open.setNum}/${open.totalSets}`
    : `Next: ${open.label}`
  const t = w.addText(taskText)
  t.font = Font.semiboldSystemFont(13)
  t.textColor = new Color('#7c9cff')
  t.lineLimit = 2

  // Bottom: time + progress
  w.addSpacer()
  const foot = w.addStack()
  foot.layoutHorizontally()
  const time = foot.addText(event.all_day ? 'All day' : fmtTime(startTime))
  time.font = Font.systemFont(11)
  time.textColor = new Color('#7c83a3')
  foot.addSpacer()
  const prog = foot.addText(`${done}/${total}`)
  prog.font = Font.semiboldSystemFont(11)
  prog.textColor = new Color('#5fd0a0')

  return w
}

// ── run ────────────────────────────────────────────────────────────────
const state = await loadNext()
const widget = buildWidget(state)
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentMedium()
}
Script.complete()
