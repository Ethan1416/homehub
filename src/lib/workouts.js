// Catalog gym exercises, look up their progress history, and compute
// research-informed next milestones using bodyweight-normalized strength
// standards and level-aware progression rates.
//
// Standards are inspired by widely-used lifting benchmarks (StrengthLevel.com,
// Symmetric Strength, ExRx norms). Numbers are bodyweight ratios for a male
// lifter on the listed movement — actual targets are scaled to the user's
// bodyweight from constants.PROFILE. Isolation/small-muscle work uses absolute
// pounds since bodyweight scaling is weak for those movements.
//
// Levels: novice → intermediate → advanced → elite.
// Progression rates per week depend on level (novice gains fast, elite slow).

import { parseEvent } from './checklist.js'
import { PROFILE_BW_LB } from './constants.js'

const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()
const normalize = (label) =>
  stripNum(label)
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()

// {key: {scale, novice, intermediate, advanced, elite, increment}}
// scale: 'bw' (multipliers of bodyweight) or 'abs' (absolute lbs).
// increment: smallest practical jump for that movement.
const STANDARDS = [
  // ── heavy compound presses ───────────────────────────────────
  [/incline press|incline barbell|incline db press/, { scale: 'bw',
    novice: 0.65, intermediate: 0.85, advanced: 1.10, elite: 1.40, increment: 5 }],
  [/flat press|bench press|flat db press/, { scale: 'bw',
    novice: 0.80, intermediate: 1.00, advanced: 1.30, elite: 1.60, increment: 5 }],
  [/decline press/, { scale: 'bw',
    novice: 0.85, intermediate: 1.10, advanced: 1.40, elite: 1.70, increment: 5 }],
  [/overhead press|seated db press|seated machine press/, { scale: 'bw',
    novice: 0.50, intermediate: 0.65, advanced: 0.85, elite: 1.05, increment: 5 }],

  // ── back: vertical + horizontal pulls ────────────────────────
  [/lat pulldown|pull-?up/, { scale: 'bw',
    novice: 0.50, intermediate: 0.70, advanced: 0.95, elite: 1.20, increment: 5 }],
  [/chest-?supported row|t-?bar row|incline-?bench db row/, { scale: 'bw',
    novice: 0.55, intermediate: 0.75, advanced: 1.00, elite: 1.25, increment: 5 }],
  [/seated cable row|seated row|cable row/, { scale: 'bw',
    novice: 0.50, intermediate: 0.70, advanced: 0.95, elite: 1.20, increment: 5 }],
  [/straight-?arm pulldown/, { scale: 'bw',
    novice: 0.25, intermediate: 0.35, advanced: 0.50, elite: 0.65, increment: 5 }],

  // ── hinge + lower body ───────────────────────────────────────
  [/hip thrust/, { scale: 'bw',
    novice: 1.00, intermediate: 1.50, advanced: 2.00, elite: 2.50, increment: 10 }],
  [/leg press/, { scale: 'bw',
    novice: 1.50, intermediate: 2.50, advanced: 3.50, elite: 4.50, increment: 10 }],
  [/leg extension/, { scale: 'bw',
    novice: 0.55, intermediate: 0.80, advanced: 1.05, elite: 1.30, increment: 5 }],
  [/seated leg curl|leg curl|lying leg curl/, { scale: 'bw',
    novice: 0.45, intermediate: 0.65, advanced: 0.85, elite: 1.05, increment: 5 }],
  [/hip adduction/, { scale: 'bw',
    novice: 0.50, intermediate: 0.75, advanced: 1.00, elite: 1.25, increment: 5 }],
  [/hip abduction/, { scale: 'bw',
    novice: 0.55, intermediate: 0.80, advanced: 1.05, elite: 1.30, increment: 5 }],
  [/seated calf|calf press|calf raise/, { scale: 'bw',
    novice: 0.70, intermediate: 1.00, advanced: 1.40, elite: 1.80, increment: 5 }],

  // ── isolation (absolute weights) ─────────────────────────────
  [/cable fly|chest fly|pec deck/, { scale: 'abs',
    novice: 25, intermediate: 40, advanced: 60, elite: 85, increment: 5 }],
  [/lateral raise/, { scale: 'abs',
    novice: 12, intermediate: 22, advanced: 32, elite: 45, increment: 2.5 }],
  [/rear delt|reverse pec/, { scale: 'abs',
    novice: 15, intermediate: 25, advanced: 40, elite: 55, increment: 2.5 }],

  // ── arms ─────────────────────────────────────────────────────
  [/incline db curl|db curl/, { scale: 'abs',
    novice: 22, intermediate: 32, advanced: 45, elite: 60, increment: 2.5 }],
  [/cable curl/, { scale: 'abs',
    novice: 35, intermediate: 55, advanced: 75, elite: 100, increment: 5 }],
  [/preacher curl/, { scale: 'abs',
    novice: 35, intermediate: 55, advanced: 75, elite: 100, increment: 5 }],
  [/pushdown|tricep pushdown/, { scale: 'abs',
    novice: 45, intermediate: 70, advanced: 100, elite: 135, increment: 5 }],
  [/overhead .*extension|overhead extension|overhead triceps/, { scale: 'abs',
    novice: 30, intermediate: 50, advanced: 75, elite: 105, increment: 2.5 }]
]

function lookup(name) {
  const lower = name.toLowerCase()
  for (const [re, s] of STANDARDS) if (re.test(lower)) return s
  // sensible default if unmatched
  return { scale: 'abs', novice: 30, intermediate: 50, advanced: 75, elite: 100, increment: 5 }
}

// Return absolute thresholds (in lb) for novice/intermediate/advanced/elite
// scaled to the user's bodyweight if the exercise uses bodyweight scaling.
function thresholds(name) {
  const s = lookup(name)
  if (s.scale === 'bw') {
    return {
      novice:       Math.round(s.novice       * PROFILE_BW_LB),
      intermediate: Math.round(s.intermediate * PROFILE_BW_LB),
      advanced:     Math.round(s.advanced     * PROFILE_BW_LB),
      elite:        Math.round(s.elite        * PROFILE_BW_LB),
      increment:    s.increment
    }
  }
  return { ...s }
}

export const LEVELS = ['untrained', 'novice', 'intermediate', 'advanced', 'elite']

export function currentLevel(name, best) {
  const t = thresholds(name)
  if (best == null || best === 0) return 'untrained'
  if (best < t.novice)       return 'untrained'
  if (best < t.intermediate) return 'novice'
  if (best < t.advanced)     return 'intermediate'
  if (best < t.elite)        return 'advanced'
  return 'elite'
}

// Approximate weekly progression in lb by level + exercise increment size.
function weeklyRate(level, increment) {
  // Untrained/novice respond rapidly; rates drop steeply as you climb.
  // Big-jump movements (inc 10) progress faster than fine isolation (inc 2.5).
  const table = {
    10:  { untrained: 8,  novice: 5,   intermediate: 2.5, advanced: 1.0,  elite: 0.4 },
    5:   { untrained: 5,  novice: 3,   intermediate: 1.5, advanced: 0.6,  elite: 0.25 },
    2.5: { untrained: 2,  novice: 1.2, intermediate: 0.6, advanced: 0.3,  elite: 0.12 }
  }
  const row = table[increment] || table[5]
  return row[level] || row.novice
}

function projectDate(weeks) {
  const d = new Date()
  d.setDate(d.getDate() + Math.round(Math.max(weeks, 1) * 7))
  return d.toISOString().slice(0, 10)
}

// All milestones for an exercise: next +increment bump plus every level
// (Novice/Intermediate/Advanced/Elite). Each entry has a status:
//   'achieved'   — best already at/above this weight
//   'next'       — the closest upcoming bump
//   'upcoming'   — future level not yet reached
export function milestonesFor(name, best, observedRate /* lb/week or null */) {
  const t = thresholds(name)
  const level = currentLevel(name, best)
  const inc = t.increment
  const defaultRate = weeklyRate(level, inc)
  let rate = defaultRate
  if (observedRate != null && observedRate > 0.05 && observedRate < 30) {
    const w = level === 'untrained' ? 0.3 : level === 'novice' ? 0.4 : 0.65
    rate = observedRate * w + defaultRate * (1 - w)
  }
  const cur = best || 0
  const ms = []

  // next +increment bump
  if (best != null) {
    const bump = Math.ceil((best + 0.01) / inc) * inc
    ms.push({
      kind: 'bump', weight: bump, label: `+${inc} lb`,
      status: 'next',
      weeks: Math.max(0.5, (bump - best) / rate),
      projectedDate: projectDate(Math.max(0.5, (bump - best) / rate))
    })
  }

  // all four levels
  for (const lk of ['novice', 'intermediate', 'advanced', 'elite']) {
    const w = t[lk]; if (w == null) continue
    if (w <= cur) {
      ms.push({ kind: 'level', weight: w, label: lk, status: 'achieved' })
    } else {
      const weeks = Math.max(2, (w - cur) / rate)
      ms.push({
        kind: 'level', weight: w, label: lk, status: 'upcoming',
        weeks, projectedDate: projectDate(weeks)
      })
    }
  }
  return ms
}

// ─── catalog + history (unchanged behaviour) ──────────────────────────────
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

export function exerciseHistory(catalogEntry, allRows) {
  const matchKeys = new Set(catalogEntry.sources.map((s) => `${s.event_id}|${s.gKey}`))
  const byDay = {}
  for (const r of allRows) {
    const m = r.item_key.match(/^(g\d+)#\d+$/)
    if (!m) continue
    const ek = `${r.event_id}|${m[1]}`
    if (!matchKeys.has(ek)) continue
    const w = Number(r.weight); const rps = Number(r.reps)
    if (!Number.isFinite(w) || w === 0) continue
    const d = r.log_date
    const cur = byDay[d] || { maxWeight: 0, volume: 0, setCount: 0, maxReps: 0 }
    if (w > cur.maxWeight) cur.maxWeight = w
    if (Number.isFinite(rps) && rps > cur.maxReps) cur.maxReps = rps
    if (Number.isFinite(rps)) cur.volume += w * rps
    cur.setCount += 1
    byDay[d] = cur
  }
  const series = Object.entries(byDay)
    .map(([d, v]) => ({ date: d, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const best = series.reduce((m, x) => x.maxWeight > m ? x.maxWeight : m, 0)
  // observed weekly rate (lb/week) over the user's history
  let observedRate = null
  if (series.length >= 2) {
    const a = series[0], z = series[series.length - 1]
    const weeks = Math.max((new Date(z.date) - new Date(a.date)) / (7 * 86400000), 0.5)
    observedRate = (z.maxWeight - a.maxWeight) / weeks
  }
  return { series, best, observedRate }
}

// Convenience back-compat exports the existing WorkoutTab uses.
export function milestoneIncrement(name) { return lookup(name).increment }
export function nextMilestone(best, name) {
  if (best == null) return null
  const inc = lookup(name).increment
  return Math.ceil((best + 0.01) / inc) * inc
}
export function projectMilestoneDate(series, target) {
  // kept so old call sites still work; uses observed rate if available
  if (target == null) return null
  if (series.length < 2) return projectDate(4)
  const z = series[series.length - 1]
  const a = series[0]
  const weeks = Math.max((new Date(z.date) - new Date(a.date)) / (7 * 86400000), 0.5)
  const rate = (z.maxWeight - a.maxWeight) / weeks
  return projectDate(rate > 0.1 ? (target - z.maxWeight) / rate : 4)
}
