// HomeHub iOS Home-Screen Widget — interactive
// ────────────────────────────────────────────
// Shows the next "not yet moved past" task for today (gym/meal/other).
// Tap zones:
//   ✓ (left)   — mark the current task DONE      (advances widget)
//   ↷ (right)  — mark the current task SKIPPED   (advances widget)
//   center     — open the HomeHub PWA in Safari
//
// Tapping ✓ or ↷ briefly opens Scriptable, fires a Supabase upsert, and
// returns. The widget refreshes on its next system tick (within ~15 min,
// or immediately if you tap it again).
//
// Install:
//   1. Install Scriptable (free, App Store).
//   2. New script → paste this whole file → name it "HomeHub".
//   3. Long-press home screen → + → Scriptable → pick Medium → choose
//      "HomeHub" in widget config.
//   4. Edit USER below to 'ethan' or 'justin'.

// ── config ─────────────────────────────────────────────────────────────
const USER = 'ethan'
const SUPABASE_URL = 'https://kiuxegztynurpthxsnvr.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpdXhlZ3p0eW51cnB0aHhzbnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTgxODksImV4cCI6MjA5NDc3NDE4OX0.XLYO2XCmXtfQvzD1tJGgdYZrqmMSBzsQBnXXZfz31ss'
const APP_URL = 'https://ethan1416.github.io/homehub/'
const SCRIPT_NAME = 'HomeHub' // must match the name you gave the script in Scriptable

// ── tiny supabase helpers ──────────────────────────────────────────────
async function sbGet(path, params = '') {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}${params ? '?' + params : ''}`)
  req.headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  return req.loadJSON()
}
async function sbUpsert(path, row, onConflict) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}?on_conflict=${onConflict}`)
  req.method = 'POST'
  req.headers = {
    apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal'
  }
  req.body = JSON.stringify(row)
  await req.loadString()
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

// ── shared: load today's events + progress and pick the next open item ─
async function loadNext() {
  const today = new Date()
  const todayKey = ymd(today)
  const [events, progress, overrides] = await Promise.all([
    sbGet('events', 'select=*'),
    sbGet('progress', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`),
    sbGet('gym_override', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`)
  ])
  const overrideId = overrides[0]?.event_id
  const overrideEv = overrideId ? events.find((e) => e.id === overrideId) : null

  let todaysEvents = events.filter((e) => occursOn(e, today))
  if (overrideEv) {
    todaysEvents = todaysEvents.filter((e) => e.type !== 'gym').concat([overrideEv])
  }
  todaysEvents.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  const byEvent = {}
  for (const r of progress) ((byEvent[r.event_id] ||= {}))[r.item_key] = r
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
          const k = `${g.key}#${s}`
          if (!moved(p[k])) return { label: stripNum(g.label), itemKey: k, setNum: s + 1, totalSets: g.sets }
        }
      } else if (!moved(p[g.key])) {
        return { label: g.label, itemKey: g.key, setNum: 0, totalSets: 0 }
      }
    }
    return null
  }

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
        next = { event: e, parsed, open, done, total, startTime: new Date(e.starts_at) }
      }
    }
  }
  return { next, todayKey, totalDone, totalAll, eventCount: todaysEvents.length }
}

// ── action handler (run when widget tap passes ?action=...) ────────────
async function applyAction(action, params) {
  const eventId = params.event
  const itemKey = params.item
  const logDate = params.day || ymd(new Date())
  if (!eventId || !itemKey) return
  const row = {
    event_id: eventId,
    log_date: logDate,
    item_key: itemKey,
    user_id: USER,
    updated_at: new Date().toISOString(),
    done: action === 'done',
    skipped: action === 'skip'
  }
  await sbUpsert('progress', row, 'event_id,log_date,item_key,user_id')
}

// ── widget rendering ───────────────────────────────────────────────────
function fmtTime(d) {
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12; if (h === 0) h = 12
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`
}

function actionUrl(action, state) {
  if (!state.next) return APP_URL
  const { event, open } = state.next
  const params = new URLSearchParams({
    action, event: event.id, item: open.itemKey, day: state.todayKey
  })
  return `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?${params.toString()}`
}

function buildWidget(state) {
  const w = new ListWidget()
  w.url = APP_URL
  w.backgroundColor = new Color('#0e1117')
  w.setPadding(12, 12, 12, 12)

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
  w.addSpacer(4)

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
  title.font = Font.boldSystemFont(14)
  title.textColor = new Color('#e8ebf5')
  title.lineLimit = 1
  w.addSpacer(6)

  // ── Interactive task row: [✓] [label] [↷] ─────────────────────────
  const row = w.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
  row.spacing = 8

  // Left: ✓ done button
  const doneBtn = row.addStack()
  doneBtn.layoutVertically()
  doneBtn.centerAlignContent()
  doneBtn.backgroundColor = new Color('#1b3a2a')
  doneBtn.cornerRadius = 10
  doneBtn.setPadding(8, 12, 8, 12)
  doneBtn.url = actionUrl('done', state)
  const dT = doneBtn.addText('✓')
  dT.font = Font.boldSystemFont(20)
  dT.textColor = new Color('#5fd0a0')
  dT.centerAlignText()

  // Center: task label (taps open PWA)
  const center = row.addStack()
  center.layoutVertically()
  center.url = APP_URL
  center.size = new Size(0, 44)
  const lbl = center.addText(open.label)
  lbl.font = Font.semiboldSystemFont(13)
  lbl.textColor = new Color('#e8ebf5')
  lbl.lineLimit = 1
  if (open.totalSets > 0) {
    const sub = center.addText(`set ${open.setNum}/${open.totalSets}`)
    sub.font = Font.systemFont(11)
    sub.textColor = new Color('#7c9cff')
  }

  // Right: ↷ skip button
  const skipBtn = row.addStack()
  skipBtn.layoutVertically()
  skipBtn.centerAlignContent()
  skipBtn.backgroundColor = new Color('#2a2a35')
  skipBtn.cornerRadius = 10
  skipBtn.setPadding(8, 12, 8, 12)
  skipBtn.url = actionUrl('skip', state)
  const sT = skipBtn.addText('↷')
  sT.font = Font.boldSystemFont(20)
  sT.textColor = new Color('#a8afc7')
  sT.centerAlignText()

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

// ── entry point ────────────────────────────────────────────────────────
const params = args.queryParameters || {}
if (params.action === 'done' || params.action === 'skip') {
  // Came from a widget tap. Fire the update and exit immediately so the
  // Scriptable app barely flashes.
  await applyAction(params.action, params)
  Script.complete()
} else {
  const state = await loadNext()
  const widget = buildWidget(state)
  if (config.runsInWidget) {
    Script.setWidget(widget)
  } else {
    await widget.presentMedium()
  }
  Script.complete()
}
