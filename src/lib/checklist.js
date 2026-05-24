// Turn an event's notes into a structured checklist.
// Gym  -> one group per numbered exercise, with a derived set count.
// Meal -> one group per component (a thing you can tick off).
// Other-> a single done toggle.

const isExercise = (l) => /^\d+[.)]\s/.test(l)

// Parse the set count from an exercise line. Handles:
//   "4 × 6-8 reps"             -> 4
//   "4 sets × 6-8 reps"        -> 4
//   "2-3 sets"                  -> 3 (use upper bound)
//   "3 sets"                    -> 3
// Falls back to 3 if nothing matches.
function setCount(line) {
  const clamp = (n) => Math.min(Math.max(n, 1), 8)
  const range = line.match(/(\d{1,2})\s*[–\-]\s*(\d{1,2})\s*sets?\b/i)
  if (range) return clamp(parseInt(range[2], 10))
  const sx = line.match(/(\d{1,2})\s*sets?\s*[×xX]/i)
  if (sx) return clamp(parseInt(sx[1], 10))
  const dash = line.match(/[—-]\s*(\d{1,2})\s*[×xX]\s*\d/)
  if (dash) return clamp(parseInt(dash[1], 10))
  const gen = line.match(/\b(\d{1,2})\s*[×xX]\s*\d/)
  if (gen) return clamp(parseInt(gen[1], 10))
  const single = line.match(/(\d{1,2})\s*sets?\b/i)
  if (single) return clamp(parseInt(single[1], 10))
  return 3
}

export function parseEvent(ev) {
  const lines = (ev.notes || '')
    .split('\n').map((s) => s.trim()).filter(Boolean)

  const titleGym = /gym|🏋/i.test(ev.title || '')
  const hasExercises = lines.some(isExercise)

  if (hasExercises || (titleGym && lines.length)) {
    const info = []
    const groups = []
    lines.forEach((l) => {
      if (isExercise(l)) {
        groups.push({
          key: `g${groups.length}`,
          label: l,
          sets: setCount(l)
        })
      } else {
        info.push(l) // header (e.g. "LEGS (QUAD FOCUS) + CORE") or trailing note
      }
    })
    return {
      kind: 'gym',
      info,
      groups,
      total: groups.reduce((s, g) => s + g.sets, 0)
    }
  }

  if (lines.length) {
    // Meal: break the note into tickable components.
    const parts = lines
      .join(' / ')
      .split(/(?<=[.;])\s+|\s*\/\s*|\s•\s/)
      .map((s) => s.replace(/[.;]\s*$/, '').trim())
      .filter((s) => s.length > 1)
    return {
      kind: 'meal',
      info: [],
      groups: parts.map((p, i) => ({ key: `m${i}`, label: p, sets: 0 })),
      total: parts.length
    }
  }

  return { kind: 'simple', info: [], groups: [{ key: '__done__', label: ev.title, sets: 0 }], total: 1 }
}

// Effort label order, most intense → least; used for stable display.
export const EFFORT_ORDER = ['max', 'high_effort', 'burn', 'easy', 'warmup', 'nothing']
export const EFFORT_LABELS = {
  max: 'max',
  high_effort: 'high effort',
  burn: 'burn',
  easy: 'easy',
  warmup: 'warmup',
  nothing: 'nothing'
}

// Distill an event's per-set progress into headline stats for display.
// Returns { total, byEffort: { label: count }, avgRest, sortedEfforts: [[label,n]...] }.
export function sessionSummary(progress) {
  const rows = Object.entries(progress || {})
    .filter(([k]) => /^g\d+#\d+$/.test(k))
    .map(([, r]) => r)
    .filter((r) => r && r.done)
  const byEffort = {}
  let restSum = 0, restCount = 0
  for (const r of rows) {
    const eff = r.effort || null
    if (eff) byEffort[eff] = (byEffort[eff] || 0) + 1
    if (r.rest_seconds != null) {
      const n = Number(r.rest_seconds)
      if (Number.isFinite(n)) { restSum += n; restCount++ }
    }
  }
  const sortedEfforts = EFFORT_ORDER
    .filter((k) => byEffort[k])
    .map((k) => [k, byEffort[k]])
  return {
    total: rows.length,
    byEffort,
    avgRest: restCount ? Math.round(restSum / restCount) : null,
    sortedEfforts
  }
}

// Count completed checkable units from a progress map keyed "item_key" (and
// "item_key#set" for gym sets).
export function completion(parsed, progress) {
  let done = 0
  for (const g of parsed.groups) {
    if (g.sets > 0) {
      for (let s = 0; s < g.sets; s++) if (progress[`${g.key}#${s}`]?.done) done++
    } else if (progress[g.key]?.done) done++
  }
  return { done, total: parsed.total }
}
