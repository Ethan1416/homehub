#!/usr/bin/env node
// Local preview of the HomeHub widget. Mirrors the parsing & "next" logic
// from homehub.scriptable.js, fetches your real Supabase data, and prints
// what the widget WOULD render right now — including which item the
// done/skip buttons would target. Also writes an SVG preview to
// /tmp/homehub-widget.png-ish (actually SVG, /tmp/homehub-widget.svg).
//
// Run:   node widgets/preview.mjs            (defaults to USER=ethan)
//        USER=justin node widgets/preview.mjs

const USER = process.env.USER_OVERRIDE || process.env.HOMEHUB_USER || 'ethan'
const SUPABASE_URL = 'https://kiuxegztynurpthxsnvr.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpdXhlZ3p0eW51cnB0aHhzbnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTgxODksImV4cCI6MjA5NDc3NDE4OX0.XLYO2XCmXtfQvzD1tJGgdYZrqmMSBzsQBnXXZfz31ss'

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
async function sb(path, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params ? '?' + params : ''}`, { headers })
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`)
  return r.json()
}

// ── parsing (mirror of widget) ──────────────────────────────────────────
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

async function loadNext() {
  const today = new Date()
  const todayKey = ymd(today)
  const [events, progress, overrides] = await Promise.all([
    sb('events', 'select=*'),
    sb('progress', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`),
    sb('gym_override', `select=*&log_date=eq.${todayKey}&user_id=eq.${USER}`)
  ])
  const overrideId = overrides[0]?.event_id
  const overrideEv = overrideId ? events.find((e) => e.id === overrideId) : null
  let todaysEvents = events.filter((e) => occursOn(e, today))
  if (overrideEv) todaysEvents = todaysEvents.filter((e) => e.type !== 'gym').concat([overrideEv])
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
      } else { total += 1; if (moved(p[g.key])) done++ }
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

  let next = null, totalDone = 0, totalAll = 0
  const eventSummaries = []
  for (const e of todaysEvents) {
    const parsed = parseEvent(e)
    const p = byEvent[e.id] || {}
    const { done, total } = completion(parsed, p)
    totalDone += done; totalAll += total
    eventSummaries.push({ event: e, parsed, done, total, first: firstOpen(parsed, p) })
    if (!next) {
      const open = firstOpen(parsed, p)
      if (open) next = { event: e, parsed, open, done, total, startTime: new Date(e.starts_at) }
    }
  }
  return { next, todayKey, totalDone, totalAll, todaysEvents, eventSummaries }
}

function fmtTime(d) {
  let h = d.getHours(), m = d.getMinutes()
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12; if (h === 0) h = 12
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`
}

function renderAscii(state) {
  const W = 50
  const line = (s = '') => '│ ' + s.padEnd(W - 4) + ' │'
  const sep = '├' + '─'.repeat(W - 2) + '┤'
  const top = '┌' + '─'.repeat(W - 2) + '┐'
  const bot = '└' + '─'.repeat(W - 2) + '┘'
  const out = [top]
  const pct = state.totalAll > 0 ? `${state.totalDone}/${state.totalAll}` : ''
  out.push(line(`HOMEHUB${' '.repeat(W - 4 - 7 - pct.length)}${pct}`))
  out.push(line(''))
  if (!state.next) {
    if (state.todaysEvents.length === 0) out.push(line('Nothing scheduled today.'))
    else out.push(line('All done for today 🎉'))
  } else {
    const { event, open, done, total, startTime } = state.next
    out.push(line(event.title.slice(0, W - 4)))
    out.push(line(''))
    const setStr = open.totalSets > 0 ? `set ${open.setNum}/${open.totalSets}` : ''
    out.push(line(` [✓]   ${open.label.slice(0, 30).padEnd(30)}   [↷] `))
    if (setStr) out.push(line(`       ${setStr}`))
    out.push(line(''))
    const t = event.all_day ? 'All day' : fmtTime(startTime)
    out.push(line(`${t}${' '.repeat(W - 4 - t.length - `${done}/${total}`.length)}${done}/${total}`))
  }
  out.push(bot)
  return out.join('\n')
}

function renderSvg(state) {
  // 360x170 widget approx Medium widget aspect
  const W = 360, H = 170
  const bg = '#0e1117'
  const text = '#e8ebf5'
  const muted = '#7c83a3'
  const accent = '#7c9cff'
  const good = '#5fd0a0'
  const pct = state.totalAll > 0 ? `${state.totalDone}/${state.totalAll}` : ''
  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(`<rect width="${W}" height="${H}" rx="22" fill="${bg}"/>`)
  // header
  parts.push(`<text x="14" y="22" font-family="SF Pro Text, system-ui" font-size="10" font-weight="700" fill="${muted}" letter-spacing="0.5">HOMEHUB</text>`)
  if (pct) parts.push(`<text x="${W - 14}" y="22" text-anchor="end" font-family="SF Pro Text, system-ui" font-size="10" font-weight="700" fill="${muted}">${pct}</text>`)
  if (!state.next) {
    const msg = state.todaysEvents.length === 0 ? 'Nothing scheduled today.' : 'All done for today 🎉'
    parts.push(`<text x="14" y="60" font-family="SF Pro Text" font-size="14" fill="${state.todaysEvents.length === 0 ? muted : good}" font-weight="700">${msg}</text>`)
  } else {
    const { event, open, done, total, startTime } = state.next
    parts.push(`<text x="14" y="42" font-family="SF Pro Text" font-size="14" font-weight="800" fill="${text}">${escapeHtml(event.title).slice(0, 40)}</text>`)
    // ✓ button
    parts.push(`<rect x="14" y="60" width="48" height="48" rx="12" fill="#1b3a2a"/>`)
    parts.push(`<text x="38" y="92" text-anchor="middle" font-family="SF Pro Text" font-size="24" font-weight="800" fill="${good}">✓</text>`)
    // label
    parts.push(`<text x="74" y="80" font-family="SF Pro Text" font-size="13" font-weight="700" fill="${text}">${escapeHtml(open.label).slice(0, 22)}</text>`)
    if (open.totalSets > 0) parts.push(`<text x="74" y="98" font-family="SF Pro Text" font-size="11" fill="${accent}">set ${open.setNum}/${open.totalSets}</text>`)
    // ↷ button
    parts.push(`<rect x="${W - 14 - 48}" y="60" width="48" height="48" rx="12" fill="#2a2a35"/>`)
    parts.push(`<text x="${W - 14 - 24}" y="92" text-anchor="middle" font-family="SF Pro Text" font-size="24" font-weight="800" fill="${muted}">↷</text>`)
    // footer
    const tStr = event.all_day ? 'All day' : fmtTime(startTime)
    parts.push(`<text x="14" y="${H - 14}" font-family="SF Pro Text" font-size="11" fill="${muted}">${tStr}</text>`)
    parts.push(`<text x="${W - 14}" y="${H - 14}" text-anchor="end" font-family="SF Pro Text" font-size="11" font-weight="700" fill="${good}">${done}/${total}</text>`)
  }
  parts.push('</svg>')
  return parts.join('')
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

const state = await loadNext()
console.log('\n' + renderAscii(state) + '\n')
console.log(`User: ${USER}`)
console.log(`Date: ${state.todayKey}`)
console.log(`Today's events (${state.todaysEvents.length}):`)
for (const s of state.eventSummaries) {
  const t = s.event.all_day ? 'all-day' : fmtTime(new Date(s.event.starts_at))
  const status = s.first ? `OPEN  → ${s.first.label} (${s.first.itemKey})` : 'all moved past'
  console.log(`  · ${t.padEnd(7)} ${s.event.title.padEnd(35)}  ${s.done}/${s.total}  ${status}`)
}
if (state.next) {
  console.log(`\nWidget "Next" pick: ${state.next.event.title} → ${state.next.open.label} (${state.next.open.itemKey})`)
  console.log(`Buttons would call scriptable:///run/HomeHub?action={done|skip}&event=${state.next.event.id}&item=${encodeURIComponent(state.next.open.itemKey)}&day=${state.todayKey}`)
} else {
  console.log(`\nWidget would show: ${state.todaysEvents.length === 0 ? '"Nothing scheduled today."' : '"All done for today 🎉"'}`)
}

const fs = await import('fs')
const svgPath = '/tmp/homehub-widget.svg'
fs.writeFileSync(svgPath, renderSvg(state))
console.log(`\nVisual preview SVG: ${svgPath}`)
