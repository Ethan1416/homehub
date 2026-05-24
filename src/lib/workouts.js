// Catalog gym exercises across all routines, look up their progress history,
// and compute next-milestone targets. Strength-progression increments are based
// on common research/lifting practice: heavy compounds add ~10 lb per milestone,
// supported rows / pulldowns ~5 lb, small isolation work ~2.5 lb.

import { parseEvent } from './checklist.js'

const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()
const normalize = (label) =>
  stripNum(label)
    .replace(/\(.*?\)/g, '')      // drop parenthetical qualifiers
    .replace(/\s+/g, ' ').trim()
    .toLowerCase()

// Increment table — keyed by regex match on (normalized) exercise name.
const INCREMENT_RULES = [
  [/incline press|flat press|decline press|bench press|overhead press/, 10],
  [/leg press|hip thrust|squat|deadlift/, 10],
  [/lat pulldown|pull-?up|chest-?supported row|seated cable row|t-?bar row|row\b/, 5],
  [/leg extension|leg curl|seated leg curl|hip adduction|hip abduction|calf press|calf raise/, 5],
  [/incline db curl|cable curl|preacher|pushdown|overhead .*extension|overhead extension/, 2.5],
  [/cable fly|straight-?arm pulldown|lateral raise|rear delt|reverse pec/, 2.5]
]
export function milestoneIncrement(name) {
  const lower = name.toLowerCase()
  for (const [re, inc] of INCREMENT_RULES) if (re.test(lower)) return inc
  return 5
}

// next target ≥ currentBest by at least one increment, snapped to the increment grid
export function nextMilestone(currentBest, name) {
  if (currentBest == null) return null
  const inc = milestoneIncrement(name)
  return Math.ceil((currentBest + 0.01) / inc) * inc
}

// Build a catalog from gym event rows: { normalized: { display, sources: [{event_id, gKey, label, sets}] } }
export function exerciseCatalog(events) {
  const map = {}
  for (const e of events) {
    if (e.type !== 'gym') continue
    const parsed = parseEvent(e)
    parsed.groups.forEach((g) => {
      if (!g.sets) return
      const key = normalize(g.label)
      if (!map[key]) {
        map[key] = {
          name: key,
          display: stripNum(g.label).replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim(),
          sources: []
        }
      }
      map[key].sources.push({ event_id: e.id, gKey: g.key, label: g.label, sets: g.sets })
    })
  }
  return map
}

// Given progress rows + a catalog entry, return per-day max weight + total volume.
// rows: array of progress rows already filtered to gym sets (item_key matches g\d+#\d+)
export function exerciseHistory(catalogEntry, allRows) {
  const matchKeys = new Set(catalogEntry.sources.map((s) => `${s.event_id}|${s.gKey}`))
  const byDay = {}
  for (const r of allRows) {
    const m = r.item_key.match(/^(g\d+)#\d+$/)
    if (!m) continue
    const ek = `${r.event_id}|${m[1]}`
    if (!matchKeys.has(ek)) continue
    const w = Number(r.weight)
    const rps = Number(r.reps)
    if (!Number.isFinite(w) || w === 0) continue
    const d = r.log_date
    const cur = byDay[d] || { maxWeight: 0, volume: 0, setCount: 0, maxReps: 0 }
    if (w > cur.maxWeight) cur.maxWeight = w
    if (Number.isFinite(rps) && rps > cur.maxReps) cur.maxReps = rps
    if (Number.isFinite(rps)) cur.volume += w * rps
    cur.setCount += 1
    byDay[d] = cur
  }
  // sorted ascending by date
  const series = Object.entries(byDay)
    .map(([d, v]) => ({ date: d, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const best = series.reduce((m, x) => x.maxWeight > m ? x.maxWeight : m, 0)
  return { series, best }
}

// Project a date for the next milestone based on progression rate.
// Returns: ISO date string (YYYY-MM-DD).
export function projectMilestoneDate(series, target) {
  if (!target) return null
  const today = new Date()
  if (series.length < 2) {
    today.setDate(today.getDate() + 28)
    return today.toISOString().slice(0, 10)
  }
  const first = series[0]
  const last = series[series.length - 1]
  const weeks = Math.max(
    (new Date(last.date) - new Date(first.date)) / (7 * 86400000), 0.5)
  const gain = last.maxWeight - first.maxWeight
  const rate = gain / weeks // lb per week
  let weeksToTarget = 4
  if (rate > 0.1) weeksToTarget = (target - last.maxWeight) / rate
  weeksToTarget = Math.max(2, Math.min(12, Math.round(weeksToTarget)))
  const proj = new Date(today)
  proj.setDate(proj.getDate() + Math.round(weeksToTarget * 7))
  return proj.toISOString().slice(0, 10)
}
