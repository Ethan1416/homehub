import { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from '../../supabaseClient.js'
// note: supabase is used by RoutineEditor below for direct event updates
import { exerciseCatalog, exerciseHistory, nextMilestone, milestoneIncrement, milestonesFor, currentLevel, recentVariability, muscleGroupFor } from '../../lib/workouts.js'
import { parseEvent } from '../../lib/checklist.js'
import { PROFILE_BW_LB } from '../../lib/constants.js'

function fmtDuration(weeks) {
  if (weeks == null) return '—'
  if (weeks < 1) return 'this week'
  if (weeks < 8) return `${Math.round(weeks)} wk`
  if (weeks < 52) return `${Math.round(weeks / 4.33)} mo`
  const years = weeks / 52
  return years < 10 ? `${years.toFixed(1)} yr` : '10+ yr'
}

// Visual style per milestone status.
const lineStyle = (m) => {
  if (m.status === 'achieved') return { color: '#bfc4d6', dash: '3 6' }
  if (m.kind === 'bump') return { color: '#e5575d', dash: '4 5' }
  // upcoming level — color graded by distance (next = bright red, far = darker)
  return { color: '#a13b3f', dash: '6 6' }
}

function ExerciseChart({ series, milestones, color = '#5b6ef5' }) {
  if (series.length === 0 && (!milestones || milestones.length === 0)) return null
  const W = 600, H = 260, P_L = 36, P_R = 104, P_T = 14, P_B = 34
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dates = series.map((s) => new Date(s.date))
  const futureMs = (milestones || []).filter((m) => m.projectedDate)
  const mDts = futureMs.map((m) => new Date(m.projectedDate))

  // X-domain bounds: left is earliest session (with two-week padding), right is
  // the furthest milestone or last session.
  const minSession = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
  let minDate = new Date(Math.min(minSession.getTime(), today.getTime()))
  const fortnight = 14 * 86400000
  if (today.getTime() - minDate.getTime() < fortnight) minDate = new Date(today.getTime() - fortnight)
  let maxDate = new Date(today.getTime() + fortnight)
  for (const d of mDts) if (d > maxDate) maxDate = d
  for (const d of dates) if (d > maxDate) maxDate = d

  // Piecewise X scale: if multi-year, give this year ~70% width and the rest
  // (compressed yearly view) ~30%. If all milestones fit inside the current
  // year, fall back to a plain linear scale.
  const yearEnd = new Date(today.getFullYear(), 11, 31)
  const totalW = W - P_L - P_R
  const multiYear = maxDate > yearEnd
  const nearFrac = 0.70
  const nearW = totalW * nearFrac
  const farW = totalW * (1 - nearFrac)
  const nearSpan = Math.max(yearEnd.getTime() - minDate.getTime(), 86400000)
  const farSpan = Math.max(maxDate.getTime() - yearEnd.getTime(), 86400000)

  const x = (d) => {
    const t = new Date(d).getTime()
    if (!multiYear) return P_L + ((t - minDate.getTime()) / Math.max(maxDate - minDate, 1)) * totalW
    if (t <= yearEnd.getTime())
      return P_L + ((t - minDate.getTime()) / nearSpan) * nearW
    return P_L + nearW + ((t - yearEnd.getTime()) / farSpan) * farW
  }

  // Y-domain
  const allLevelWs = (milestones || []).map((m) => m.weight)
  const allW = [...series.map((s) => s.maxWeight), ...allLevelWs]
  const yLo = Math.max(0, Math.min(...allW, 0) * 0.85)
  const yHi = Math.max(...allW, 100) * 1.10
  const y = (val) => H - P_B - ((val - yLo) / Math.max(yHi - yLo, 1)) * (H - P_T - P_B)
  const pts = series.map((s) => `${x(s.date).toFixed(1)},${y(s.maxWeight).toFixed(1)}`).join(' ')

  // Tick generation — monthly for the current year, yearly beyond.
  const ticks = []
  const monthFmt = (d) =>
    d.toLocaleDateString([], { month: 'short' }) + (d.getFullYear() !== today.getFullYear() ? ` '${String(d.getFullYear()).slice(-2)}` : '')
  // monthly in near zone
  {
    const t = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (t <= (multiYear ? yearEnd : maxDate)) {
      if (t >= minDate) ticks.push({ d: new Date(t), label: monthFmt(t) })
      t.setMonth(t.getMonth() + 1)
    }
  }
  // yearly in far zone (Jan 1 of each year > current year)
  if (multiYear) {
    for (let yr = today.getFullYear() + 1; yr <= maxDate.getFullYear(); yr++) {
      ticks.push({ d: new Date(yr, 0, 1), label: String(yr) })
    }
  }
  // Density throttle: drop labels that would land within 38px of the prior.
  const drawnTicks = []
  let lastX = -Infinity
  for (const t of ticks) {
    const px = x(t.d)
    if (px - lastX < 38) continue
    drawnTicks.push({ ...t, px })
    lastX = px
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wo-chart" preserveAspectRatio="xMidYMid meet">
      {/* baseline */}
      <line x1={P_L} y1={H - P_B} x2={W - P_R} y2={H - P_B} stroke="#dde0eb" strokeWidth="1" />

      {/* near/far boundary indicator (subtle) */}
      {multiYear && (
        <line x1={P_L + nearW} y1={P_T} x2={P_L + nearW} y2={H - P_B}
          stroke="#eceef5" strokeWidth="1" strokeDasharray="2 4" />
      )}

      {/* horizontal milestone lines + right-side labels */}
      {(milestones || []).map((m, i) => {
        const s = lineStyle(m)
        const yy = y(m.weight)
        const label = m.kind === 'bump' ? `next +${m.label.replace(' lb','')}` : m.label
        return (
          <g key={`l${i}`}>
            <line x1={P_L} y1={yy} x2={W - P_R} y2={yy}
              stroke={s.color} strokeDasharray={s.dash} strokeWidth="1.3" />
            <text x={W - P_R + 6} y={yy + 4} fontSize="10.5"
              fill={s.color}
              fontWeight={m.status === 'achieved' ? 500 : 700}
              style={{ textTransform: 'capitalize' }}>
              {label} {m.weight}{m.status === 'achieved' ? ' ✓' : ''}
            </text>
          </g>
        )
      })}

      {/* series */}
      {series.length >= 2 && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {series.map((s, i) => (
        <circle key={i} cx={x(s.date)} cy={y(s.maxWeight)} r="3.6" fill={color} />
      ))}

      {/* future-projected dots */}
      {futureMs.map((m, i) => {
        const s = lineStyle(m)
        return (
          <g key={`m${i}`}>
            <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="6" fill="#fff"
              stroke={s.color} strokeWidth="2.4" />
            <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="3" fill={s.color} />
          </g>
        )
      })}

      {/* x-axis ticks (months / years) */}
      {drawnTicks.map((t, i) => (
        <g key={`x${i}`}>
          <line x1={t.px} y1={H - P_B} x2={t.px} y2={H - P_B + 3}
            stroke="#bfc4d6" strokeWidth="1" />
          <text x={t.px} y={H - P_B + 16}
            fontSize="10.5" fill="#8b90a3" textAnchor="middle">{t.label}</text>
        </g>
      ))}
    </svg>
  )
}

function ExerciseDetail({ ex, allRows, onBack }) {
  const { series, best, observedRate } = exerciseHistory(ex, allRows)
  const milestones = milestonesFor(ex.name, best, observedRate)
  const upcoming = milestones
    .filter((m) => m.status !== 'achieved')
    .sort((a, b) => a.weight - b.weight)
  const level = currentLevel(ex.name, best)
  const last = series[series.length - 1]
  const v = recentVariability(series, 14)

  return (
    <>
      <button className="back-btn" onClick={onBack}>‹ Back</button>
      <div className="md-hero">
        <div className="md-name">{ex.display}</div>
        <div className="md-status">
          Your status: <b>{level}</b>
        </div>
        <div className="md-state">
          {best > 0 ? `Best ${best} lb` : 'No history yet'}
          {last && (
            <> · last {last.maxWeight} × {last.maxReps} on {new Date(last.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</>
          )}
        </div>
        {observedRate != null && observedRate > 0 && (
          <div className="md-when">Your rate: ~{observedRate.toFixed(1)} lb / week</div>
        )}
      </div>

      <div className="wo-card">
        <div className="wo-card-h">
          <small>Progression</small>
          <b>{series.length} session{series.length === 1 ? '' : 's'}</b>
        </div>
        <ExerciseChart series={series} milestones={milestones} />
        {v.trend && v.sessions >= 2 && (
          <div className={`wo-trend wo-trend-${v.trend}`}>
            <b>
              {v.trend === 'up' && '▲ Trending up'}
              {v.trend === 'down' && '▼ Trending down'}
              {v.trend === 'flat' && '◇ Holding steady'}
            </b>
            <span>
              {v.trend !== 'flat' && (
                <>
                  Weight {v.weightPct >= 0 ? '+' : ''}{v.weightPct.toFixed(1)}%
                  {' '}({v.weightDelta >= 0 ? '+' : ''}{Math.round(v.weightDelta)} lb)
                  {' · '}
                  Volume {v.volumePct >= 0 ? '+' : ''}{v.volumePct.toFixed(0)}%
                  {' '}over {v.sessions} sessions in 2 weeks
                </>
              )}
              {v.trend === 'flat' && (
                <>No meaningful change over {v.sessions} session{v.sessions === 1 ? '' : 's'} in 2 weeks</>
              )}
            </span>
          </div>
        )}
        {(!v.trend || v.sessions < 2) && series.length > 0 && (
          <div className="wo-trend wo-trend-flat">
            <b>Not enough data yet</b>
            <span>Need at least 2 sessions in the last 2 weeks to show a trend.</span>
          </div>
        )}
      </div>

      <div className="wo-mlist">
        {upcoming.map((m, i) => {
          const isBump = m.kind === 'bump'
          const color = isBump ? '#e5575d' : '#a13b3f'
          const heading = isBump
            ? `Next +${m.label.replace(' lb', '')} bump`
            : m.label
          return (
            <div className="wo-mrow" key={i}>
              <div className="wo-mrow-l">
                <small style={{ color }}>{heading}</small>
                <b style={{ color }}>{m.weight} lb</b>
              </div>
              <div className="wo-mrow-r">
                <span className="wo-mdate">{fmtDuration(m.weeks)}</span>
                <span className="wo-mdate dim">
                  {new Date(m.projectedDate).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="cal-hint">
        Standards are bodyweight-scaled for {Math.round(PROFILE_BW_LB)} lb male, 27 yo.
        Faded grey = already achieved · light red = next +increment bump · dark red = level promotion.
        Projection blends your observed weekly rate with level-typical gains.
      </p>
    </>
  )
}

const SECTIONS = [
  { k: 'progress', label: 'Progress' },
  { k: 'exercises', label: 'Exercises' },
  { k: 'routines', label: 'Routines' }
]

export default function WorkoutTab({ events, user = 'ethan', focusedEventId, clearFocus, navReq }) {
  const [allRows, setAllRows] = useState([])
  const [open, setOpen] = useState(null) // exercise name (normalized) when detail open
  const [section, setSection] = useState('progress')
  const [routineOpen, setRoutineOpen] = useState(null) // which weekday event id is open for editing
  const focusedEvent = focusedEventId ? events.find((e) => e.id === focusedEventId) : null

  // External nav: when a navReq nonce arrives, jump to its exercise detail.
  useEffect(() => {
    if (navReq?.ex) { setSection('progress'); setOpen(navReq.ex) }
  }, [navReq?.nonce])

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    async function load() {
      const since = new Date(); since.setDate(since.getDate() - 180)
      const { data } = await supabase
        .from('progress').select('*')
        .eq('user_id', user)
        .gte('log_date', since.toISOString().slice(0, 10))
      if (!cancelled) setAllRows(data || [])
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const catalog = useMemo(() => exerciseCatalog(events), [events])
  const filteredCatalog = useMemo(() => {
    if (!focusedEventId) return catalog
    const m = {}
    for (const [k, c] of Object.entries(catalog)) {
      if (c.sources.some((s) => s.event_id === focusedEventId)) m[k] = c
    }
    return m
  }, [catalog, focusedEventId])

  const list = useMemo(() => {
    return Object.values(filteredCatalog).map((c) => {
      const { series, best } = exerciseHistory(c, allRows)
      return { ...c, series, best, last: series[series.length - 1] }
    }).sort((a, b) => {
      // most-recently-trained first, else alphabetical
      const ad = a.last?.date || ''
      const bd = b.last?.date || ''
      if (ad && bd) return bd.localeCompare(ad)
      if (ad) return -1
      if (bd) return 1
      return a.display.localeCompare(b.display)
    })
  }, [filteredCatalog, allRows])

  if (open) {
    const ex = catalog[open]
    if (!ex) {
      setOpen(null)
      return null
    }
    return <ExerciseDetail ex={ex} allRows={allRows} onBack={() => setOpen(null)} />
  }

  // Group exercises by muscle group for the Exercises sub-page
  const grouped = useMemo(() => {
    const g = {}
    for (const c of list) {
      const m = muscleGroupFor(c.display)
      ;(g[m] ||= []).push(c)
    }
    return g
  }, [list])
  const groupOrder = ['Chest','Back','Shoulders','Biceps','Triceps','Quads',
    'Hamstrings','Glutes / Hips','Calves','Core','Cardio','Other']

  return (
    <>
      <div className="ora-hdr">
        <div className="ph-greet">Workout</div>
        <div className="ph-stat" style={{ fontSize: 22 }}>
          {section === 'progress' && `${list.length} exercises`}
          {section === 'exercises' && 'By muscle group'}
          {section === 'routines' && 'Weekly plan'}
        </div>
      </div>

      <div className="wo-seg">
        {SECTIONS.map((s) => (
          <button key={s.k} className={`wo-seg-btn ${section === s.k ? 'on' : ''}`}
            onClick={() => setSection(s.k)}>{s.label}</button>
        ))}
      </div>

      {section === 'progress' && (
        <>
          {focusedEvent && (
            <div className="wo-focus">
              <span className="wo-focus-l">
                <small>Showing</small>
                <b>{focusedEvent.title}</b>
              </span>
              <button className="wo-focus-clear" onClick={clearFocus}>Show all ×</button>
            </div>
          )}
          {list.length === 0 && <p className="cal-hint">No exercises here.</p>}
          {list.map((c) => {
            const tgt = nextMilestone(c.best, c.name)
            return (
              <button className="wo-row" key={c.name} onClick={() => setOpen(c.name)}>
                <div className="wo-row-l">
                  <b>{c.display}</b>
                  <small>
                    {c.best > 0
                      ? `Best ${c.best} lb · ${c.series.length} session${c.series.length === 1 ? '' : 's'}`
                      : 'No history yet'}
                  </small>
                </div>
                <div className="wo-row-r">
                  {tgt && <span className="wo-tgt">→ {tgt}</span>}
                  <span className="cl-chev">›</span>
                </div>
              </button>
            )
          })}
        </>
      )}

      {section === 'exercises' && (
        <ExercisesByGroup grouped={grouped} order={groupOrder} onOpen={setOpen} />
      )}

      {section === 'routines' &&
        (routineOpen
          ? <RoutineEditor eventId={routineOpen} events={events} user={user}
              onBack={() => setRoutineOpen(null)} />
          : <RoutinesList events={events} onOpen={setRoutineOpen} />)}
    </>
  )
}

// --- Exercises grouped by muscle group ---
function ExercisesByGroup({ grouped, order, onOpen }) {
  return (
    <>
      {order.map((g) => {
        const arr = grouped[g]
        if (!arr || arr.length === 0) return null
        return (
          <div className="wo-group" key={g}>
            <div className="wo-group-h">{g}<span>{arr.length}</span></div>
            {arr.map((c) => (
              <button className="wo-row" key={c.name} onClick={() => onOpen(c.name)}>
                <div className="wo-row-l">
                  <b>{c.display}</b>
                  <small>{c.best > 0 ? `Best ${c.best} lb` : 'No history yet'}</small>
                </div>
                <span className="cl-chev">›</span>
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

// --- Weekly routines list ---
const DOW_ORDER = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const dowKeyOf = (e) => {
  if (Array.isArray(e.days_of_week) && e.days_of_week.length > 0) return e.days_of_week[0]
  return new Date(e.starts_at).getDay()
}
function RoutinesList({ events, onOpen }) {
  const gymTemplates = events
    .filter((e) => e.type === 'gym' && e.recurrence === 'weekly')
  // build a slot per weekday Mon..Sun
  const byDow = {}
  for (const e of gymTemplates) {
    const d = dowKeyOf(e)
    const k = d === 0 ? 6 : d - 1  // map Sun→6, Mon→0
    ;(byDow[k] ||= []).push(e)
  }
  return (
    <>
      {DOW_ORDER.map((label, i) => {
        const arr = byDow[i] || []
        return (
          <div className="wo-routine-day" key={i}>
            <div className="wo-routine-day-h">{label}</div>
            {arr.length === 0 ? (
              <div className="wo-routine-rest">Rest day</div>
            ) : (
              arr.map((e) => (
                <button className="wo-routine-row" key={e.id} onClick={() => onOpen(e.id)}>
                  <div className="wo-routine-row-l">
                    <b>{e.title}</b>
                    <small>{(e.notes || '').split('\n').filter((l) => /^\d+\.\s/.test(l)).length} exercises</small>
                  </div>
                  <span className="cl-chev">›</span>
                </button>
              ))
            )}
          </div>
        )
      })}
    </>
  )
}

// --- Edit the exercise list of one routine (add/remove) ---
function RoutineEditor({ eventId, events, user, onBack }) {
  const ev = events.find((e) => e.id === eventId)
  const [lines, setLines] = useState(() => {
    if (!ev) return []
    return (ev.notes || '').split('\n')
      .map((l) => l.trim()).filter(Boolean)
  })
  const [addingEx, setAddingEx] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!ev) return <button className="back-btn" onClick={onBack}>‹ Back</button>

  const numbered = lines.filter((l) => /^\d+\.\s/.test(l))
  const info = lines.filter((l) => !/^\d+\.\s/.test(l))

  function removeExercise(idx) {
    const others = lines.filter((l) => !/^\d+\.\s/.test(l))
    const kept = numbered.filter((_, i) => i !== idx)
    const renumbered = kept.map((l, i) => l.replace(/^\d+\.\s*/, `${i + 1}. `))
    setLines([
      ...others.slice(0, 1),       // header line (first non-numbered)
      ...renumbered,
      ...others.slice(1)           // trailing notes (rest)
    ])
  }

  function appendExercise(name, sets, reps) {
    if (!name) return
    const setsN = parseInt(sets, 10) || 3
    const others = lines.filter((l) => !/^\d+\.\s/.test(l))
    const newLine = `${numbered.length + 1}. ${name} — ${setsN} sets × ${reps || '8-10'} reps`
    setLines([
      ...others.slice(0, 1),
      ...numbered,
      newLine,
      ...others.slice(1)
    ])
    setAddingEx(null)
  }

  async function save() {
    setBusy(true)
    await supabase.from('events').update({
      notes: lines.join('\n')
    }).eq('id', eventId)
    setBusy(false)
    onBack()
  }

  return (
    <>
      <button className="back-btn" onClick={onBack}>‹ Back to routines</button>
      <div className="md-hero">
        <div className="md-name">{ev.title}</div>
        <div className="md-status">{numbered.length} exercise{numbered.length === 1 ? '' : 's'}</div>
      </div>

      <div className="wo-edit-list">
        {numbered.map((line, i) => (
          <div className="wo-edit-row" key={i}>
            <span>{line.replace(/^\d+\.\s*/, `${i + 1}. `)}</span>
            <button className="wo-edit-del" onClick={() => removeExercise(i)} title="Remove">×</button>
          </div>
        ))}
        {!addingEx && (
          <button className="cl-add-exercise"
            onClick={() => setAddingEx({ name: '', sets: '3', reps: '8-10' })}>
            + Add an exercise
          </button>
        )}
        {addingEx && (
          <div className="cl-add-ex-form">
            <div className="cl-add-ex-h">Add to {ev.title}</div>
            <div className="fld">
              <label>Name</label>
              <input autoFocus value={addingEx.name}
                placeholder="e.g. Pull-ups"
                onChange={(e) => setAddingEx((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="fld row2">
              <div>
                <label>Sets</label>
                <input inputMode="numeric" value={addingEx.sets}
                  onChange={(e) => setAddingEx((s) => ({ ...s, sets: e.target.value }))} />
              </div>
              <div>
                <label>Reps</label>
                <input value={addingEx.reps}
                  onChange={(e) => setAddingEx((s) => ({ ...s, reps: e.target.value }))} />
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn ghost" onClick={() => setAddingEx(null)}>Cancel</button>
              <button className="btn primary"
                onClick={() => appendExercise(addingEx.name.trim(), addingEx.sets, addingEx.reps)}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sheet-actions" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={onBack}>Discard changes</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? '…' : 'Save'}</button>
      </div>
    </>
  )
}
