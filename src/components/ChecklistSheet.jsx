import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEvent, completion, defaultRestFor, EFFORT_LABELS } from '../lib/checklist.js'
import { useProgress, saveProgress, setGymOverride, clearGymOverride } from '../lib/useData.js'
import { useEvents } from '../lib/useData.js'
import { supabase } from '../supabaseClient.js'
import { ymd, fmtTime } from '../lib/date.js'
import { exerciseKey, exerciseCatalog, exerciseHistory, recentVariability } from '../lib/workouts.js'

const EFFORT_OPTS = [
  ['', '— label —'],
  ['nothing', 'nothing'],
  ['warmup', 'warmup'],
  ['easy', 'easy'],
  ['burn', 'burn'],
  ['high_effort', 'high effort'],
  ['max', 'max']
]

// "3. Hip thrust — 3 sets × 10–12 reps. Glutes." → "Hip thrust"
const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()

export default function ChecklistSheet({ event, day, user = 'ethan', onClose, onEdit, onOpenExercise, onBuildCustom }) {
  const parsed = parseEvent(event)
  const logDate = ymd(day)
  const { byEvent } = useProgress(logDate, user)
  const remote = byEvent[event.id] || {}

  const [v, setV] = useState({})
  const [setExpanded, setSetExpanded] = useState({})   // per-set toggle (re-expand a done set)
  const [exExpanded, setExExpanded] = useState({})     // per-exercise toggle (re-expand a fully-done exercise)
  useEffect(() => { setV({}); setSetExpanded({}); setExExpanded({}) }, [logDate, event.id])
  const cell = (k) => v[k] || remote[k] || {}

  const put = (key, patch) => {
    setV((s) => ({ ...s, [key]: { ...(s[key] || remote[key] || {}), ...patch } }))
    saveProgress(event.id, logDate, key, patch, user)
  }

  const merged = { ...remote, ...v }
  const { done, total } = completion(parsed, merged)
  const sub = cell('__sub__')

  // ----- swipe-down to dismiss (iOS-style)
  // - Always tracks the gesture (drag from anywhere on the sheet, including over
  //   scrolled content / buttons).
  // - If the inner scroll area has scrollTop > 0, the scroll handles the gesture
  //   normally. Once scrollTop === 0 and the finger keeps moving down, the sheet
  //   itself starts dragging.
  // - Snap back on release unless distance > 130px OR a quick downward flick
  //   (velocity > 0.6 px/ms over the last segment).
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  const drag = useRef({
    y0: 0, lastY: 0, lastT: 0, dy: 0, v: 0, dragging: false, started: false
  })

  function onTouchStart(e) {
    const t = e.touches[0]
    drag.current = {
      y0: t.clientY, lastY: t.clientY, lastT: performance.now(),
      dy: 0, v: 0, dragging: false, started: true
    }
  }
  function onTouchMove(e) {
    if (!drag.current.started) return
    const y = e.touches[0].clientY
    const now = performance.now()
    const totalDy = y - drag.current.y0
    drag.current.v = (y - drag.current.lastY) / Math.max(now - drag.current.lastT, 1)
    drag.current.lastY = y
    drag.current.lastT = now

    const scrollTop = bodyRef.current?.scrollTop ?? 0
    // Begin dragging the sheet only once we're already at the top AND moving down.
    if (!drag.current.dragging && totalDy > 0 && scrollTop === 0) {
      drag.current.dragging = true
    }
    if (drag.current.dragging) {
      if (totalDy > 0) {
        e.preventDefault()
        drag.current.dy = totalDy
        if (sheetRef.current) sheetRef.current.style.transform = `translateY(${totalDy}px)`
      } else {
        // dragged back up past start — release
        drag.current.dragging = false
        drag.current.dy = 0
        if (sheetRef.current) sheetRef.current.style.transform = ''
      }
    }
  }
  function onTouchEnd() {
    if (!drag.current.started) return
    const { dy, v, dragging } = drag.current
    drag.current = { y0: 0, lastY: 0, lastT: 0, dy: 0, v: 0, dragging: false, started: false }
    if (!dragging) return
    if (sheetRef.current) sheetRef.current.style.transform = ''
    if (dy > 130 || v > 0.6) onClose()
  }

  // ----- routine swap -----
  const allEvents = useEvents().events
  const [pickRoutine, setPickRoutine] = useState(false)
  const gymTemplates = allEvents.filter((e) => e.type === 'gym' && e.id !== event.id)

  // ----- per-exercise 2-week trend (weight / volume %) -----
  // Fetch the user's last ~60 days of progress once when the sheet opens.
  const [allRows, setAllRows] = useState([])
  useEffect(() => {
    if (parsed.kind !== 'gym') return
    let cancelled = false
    ;(async () => {
      const since = new Date(); since.setDate(since.getDate() - 60)
      const { data } = await supabase
        .from('progress').select('*')
        .eq('user_id', user)
        .gte('log_date', since.toISOString().slice(0, 10))
      if (!cancelled) setAllRows(data || [])
    })()
    return () => { cancelled = true }
  }, [event.id, user, parsed.kind])

  const catalog = useMemo(() => exerciseCatalog(allEvents), [allEvents])
  const trendByKey = useMemo(() => {
    const out = {}
    for (const k in catalog) {
      const { series } = exerciseHistory(catalog[k], allRows)
      const v = recentVariability(series, 14)
      if (v.trend && v.sessions >= 2) out[k] = v
    }
    return out
  }, [catalog, allRows])
  async function swap(toEventId) { await setGymOverride(logDate, toEventId, user); setPickRoutine(false); onClose() }
  async function resetSwap()    { await clearGymOverride(logDate, user); setPickRoutine(false); onClose() }

  // ----- add an exercise to this workout (template-level or one-off) -----
  const [addEx, setAddEx] = useState(null) // null | { name, sets, reps, scope }
  const dowName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day.getDay()]
  async function commitAddExercise() {
    if (!addEx?.name?.trim()) { setAddEx(null); return }
    const setsN = parseInt(addEx.sets, 10) || 3
    const repsR = (addEx.reps || '8-10').trim()
    const nextIdx = (event.notes || '').split('\n').filter((l) => /^\d+\.\s/.test(l)).length + 1
    const newLine = `${nextIdx}. ${addEx.name.trim()} — ${setsN} sets × ${repsR} reps`
    const newNotes = ((event.notes || '').trimEnd() + '\n' + newLine).trim()
    const goingOneOff = addEx.scope === 'once' && event.recurrence === 'weekly'

    if (goingOneOff) {
      const cs = new Date(day); cs.setHours(12, 0, 0, 0)
      const ce = new Date(cs); ce.setHours(13, 0, 0, 0)
      const { data } = await supabase.from('events').insert([{
        title: event.title + ' (today)',
        owner: event.owner, type: 'gym', recurrence: 'none',
        starts_at: cs.toISOString(), ends_at: ce.toISOString(),
        notes: newNotes
      }]).select('id')
      if (data?.[0]) await setGymOverride(logDate, data[0].id, user)
    } else {
      await supabase.from('events').update({ notes: newNotes }).eq('id', event.id)
    }
    setAddEx(null)
    onClose()
  }

  // total sets to render = max(prescribed, anything already logged)
  function effectiveSetCount(g) {
    let max = g.sets - 1
    for (const k in merged) {
      const m = k.match(new RegExp(`^${g.key}#(\\d+)$`))
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return max + 1
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet cl" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={(e) => e.stopPropagation()}>
        <div className="cl-head">
          <div>
            <h2>{event.title}</h2>
            <div className="cl-sub">
              {event.all_day ? 'All day' : fmtTime(event.starts_at)}
              {' · '}{day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div className="cl-prog">{done}/{total}</div>
        </div>

        {parsed.kind === 'gym' && !pickRoutine && (
          <button className="cl-swap" onClick={() => setPickRoutine(true)}>
            Change routine for {day.toLocaleDateString([], { weekday: 'long' })} ⇄
          </button>
        )}

        {pickRoutine && (
          <div className="cl-pick">
            <div className="cl-pick-h">Pick a gym routine for {day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            {onBuildCustom && (
              <button className="cl-pick-row custom" onClick={() => { setPickRoutine(false); onBuildCustom() }}>
                <b>+ Build a custom workout</b>
                <small>Blank slate — set your own exercises, sets, and reps</small>
              </button>
            )}
            {gymTemplates.map((g) => (
              <button className="cl-pick-row" key={g.id} onClick={() => swap(g.id)}>
                <b>{g.title}</b>
                <small>{(g.notes || '').split('\n')[0]}</small>
              </button>
            ))}
            <button className="cl-pick-row reset" onClick={resetSwap}>
              <b>Use the default for this weekday</b>
              <small>Removes today's swap.</small>
            </button>
            <button className="cl-pick-cancel" onClick={() => setPickRoutine(false)}>Cancel</button>
          </div>
        )}

        <div className="cl-body" ref={bodyRef}>
          {parsed.info.map((t, i) => <div className="cl-info" key={i}>{t}</div>)}

          {parsed.groups.map((g) => {
            if (g.sets === 0) {
              // Non-set checkable item (meal component / simple)
              return (
                <button className={`cl-item ${cell(g.key).done ? 'on' : ''}`} key={g.key}
                  onClick={() => put(g.key, { done: !cell(g.key).done })}>
                  <span className="cl-box">{cell(g.key).done ? '✓' : ''}</span>
                  <span>{g.label}</span>
                </button>
              )
            }

            const totalSets = effectiveSetCount(g)
            const setKeys = Array.from({ length: totalSets }, (_, s) => `${g.key}#${s}`)
            const allDone = setKeys.length > 0 && setKeys.every((k) => cell(k).done)
            const collapseEx = allDone && !exExpanded[g.key]
            const restPlaceholder = defaultRestFor(g.label)

            if (collapseEx) {
              return (
                <button className="cl-ex-done" key={g.key}
                  onClick={() => setExExpanded((e) => ({ ...e, [g.key]: true }))}>
                  <span className="cl-ex-name">{stripNum(g.label)}</span>
                  <span className="cs-tick">✓</span>
                </button>
              )
            }

            const trend = trendByKey[exerciseKey(g.label)]
            return (
              <div className="cl-ex" key={g.key}>
                <div className="cl-ex-name-row">
                  {onOpenExercise && parsed.kind === 'gym' ? (
                    <button className="cl-ex-name cl-ex-link"
                      onClick={() => onOpenExercise(exerciseKey(g.label))}>
                      {g.label}
                      <span className="cl-ex-arrow">↗</span>
                    </button>
                  ) : (
                    <span className="cl-ex-name">{g.label}</span>
                  )}
                  {trend && (
                    <span className={`cl-ex-trend wo-trend-pill-${trend.trend}`}
                      title="2-week change · weight / volume">
                      {trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '◇'}{' '}
                      {(trend.weightPct >= 0 ? '+' : '') + Math.round(trend.weightPct)}%
                      {' / '}
                      {(trend.volumePct >= 0 ? '+' : '') + Math.round(trend.volumePct)}%v
                    </span>
                  )}
                  {allDone && (
                    <button className="cs-recollapse"
                      onClick={() => setExExpanded((e) => ({ ...e, [g.key]: false }))}>−</button>
                  )}
                </div>
                <div className="cl-sets-v2">
                  {setKeys.map((k, s) => {
                    const c = cell(k)
                    const isCollapsed = c.done && !setExpanded[k]
                    if (isCollapsed) {
                      return (
                        <button className="cl-set-mini" key={k}
                          onClick={() => setSetExpanded((e) => ({ ...e, [k]: true }))}>
                          <span className="cs-num">Set {s + 1}</span>
                          <span className="cs-tick">✓</span>
                        </button>
                      )
                    }
                    return (
                      <div className={`cl-set2 ${c.effort || ''}`} key={k}>
                        <div className="cs-left">
                          <span className="cs-num">Set {s + 1}</span>
                          <button className={`cs-check ${c.done ? 'on' : ''}`}
                            onClick={() => {
                              const newDone = !c.done
                              put(k, { done: newDone })
                              if (newDone) setSetExpanded((e) => ({ ...e, [k]: false }))
                            }}>
                            {c.done ? '✓' : ''}
                          </button>
                          {c.done && setExpanded[k] && (
                            <button className="cs-recollapse"
                              onClick={() => setSetExpanded((e) => ({ ...e, [k]: false }))}>−</button>
                          )}
                        </div>
                        <div className="cs-right">
                          <div className="cs-main">
                            <input inputMode="decimal" placeholder="weight" value={c.weight || ''}
                              onChange={(e) => setV((st) => ({ ...st, [k]: { ...cell(k), weight: e.target.value } }))}
                              onBlur={(e) => put(k, { weight: e.target.value })} />
                            <input inputMode="numeric" placeholder="reps" value={c.reps || ''}
                              onChange={(e) => setV((st) => ({ ...st, [k]: { ...cell(k), reps: e.target.value } }))}
                              onBlur={(e) => put(k, { reps: e.target.value })} />
                            <select value={c.effort || ''}
                              onChange={(e) => put(k, { effort: e.target.value || null })}>
                              {EFFORT_OPTS.map(([vv, l]) => <option key={vv} value={vv}>{l}</option>)}
                            </select>
                          </div>
                          <div className="cs-extras">
                            <input inputMode="numeric" placeholder="½ reps" value={c.half_reps || ''}
                              onChange={(e) => setV((st) => ({ ...st, [k]: { ...cell(k), half_reps: e.target.value } }))}
                              onBlur={(e) => put(k, { half_reps: e.target.value || null })} />
                            <div className="cs-rest">
                              <input inputMode="numeric" placeholder={String(restPlaceholder)}
                                value={c.rest_seconds ?? ''}
                                onChange={(e) => setV((st) => ({ ...st, [k]: { ...cell(k), rest_seconds: e.target.value } }))}
                                onBlur={(e) => put(k, { rest_seconds: e.target.value ? parseInt(e.target.value, 10) : null })} />
                              <span className="cs-rest-suffix">s rest</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <button className="cl-add-set"
                    onClick={() => put(`${g.key}#${totalSets}`, { done: false })}>
                    + Add a set
                  </button>
                </div>

                <input className="cl-ex-note" placeholder={`Notes on ${stripNum(g.label)} (optional)`}
                  value={cell(g.key).note || ''}
                  onChange={(e) => setV((s) => ({ ...s, [g.key]: { ...cell(g.key), note: e.target.value } }))}
                  onBlur={(e) => put(g.key, { note: e.target.value || null })} />
              </div>
            )
          })}

          {parsed.kind === 'gym' && !addEx && (
            <button className="cl-add-exercise"
              onClick={() => setAddEx({ name: '', sets: '3', reps: '8-10', scope: event.recurrence === 'weekly' ? 'permanent' : 'permanent' })}>
              + Add an exercise
            </button>
          )}

          {addEx && (
            <div className="cl-add-ex-form">
              <div className="cl-add-ex-h">Add an exercise</div>
              <div className="fld">
                <label>Name</label>
                <input autoFocus placeholder="e.g. Hanging leg raises"
                  value={addEx.name}
                  onChange={(e) => setAddEx((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="fld row2">
                <div>
                  <label>Sets</label>
                  <input inputMode="numeric" value={addEx.sets}
                    onChange={(e) => setAddEx((s) => ({ ...s, sets: e.target.value }))} />
                </div>
                <div>
                  <label>Reps</label>
                  <input value={addEx.reps} placeholder="8-10"
                    onChange={(e) => setAddEx((s) => ({ ...s, reps: e.target.value }))} />
                </div>
              </div>
              {event.recurrence === 'weekly' && (
                <div className="fld">
                  <label>Add to {dowName} routine</label>
                  <div className="chips">
                    <button className={`chip ${addEx.scope === 'permanent' ? 'on' : ''}`}
                      style={{ color: 'var(--accent)' }}
                      onClick={() => setAddEx((s) => ({ ...s, scope: 'permanent' }))}>
                      ↻ Every {dowName}
                    </button>
                    <button className={`chip ${addEx.scope === 'once' ? 'on' : ''}`}
                      style={{ color: 'var(--accent)' }}
                      onClick={() => setAddEx((s) => ({ ...s, scope: 'once' }))}>
                      Just today
                    </button>
                  </div>
                </div>
              )}
              <div className="sheet-actions">
                <button className="btn ghost" onClick={() => setAddEx(null)}>Cancel</button>
                <button className="btn primary" onClick={commitAddExercise}>Add</button>
              </div>
            </div>
          )}

          {parsed.kind === 'meal' && (
            <div className="fld" style={{ marginTop: 14 }}>
              <label>Substitution / notes</label>
              <textarea placeholder="Had something different? Note it here…"
                value={sub.note || ''}
                onChange={(e) => setV((s) => ({ ...s, __sub__: { ...sub, note: e.target.value } }))}
                onBlur={(e) => put('__sub__', { note: e.target.value })} />
            </div>
          )}
        </div>

        <div className="sheet-actions">
          <button className="btn ghost" onClick={onEdit}>Edit event</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
