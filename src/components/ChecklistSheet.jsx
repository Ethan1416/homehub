import { useEffect, useRef, useState } from 'react'
import { parseEvent, completion, defaultRestFor, EFFORT_LABELS } from '../lib/checklist.js'
import { useProgress, saveProgress, setGymOverride, clearGymOverride } from '../lib/useData.js'
import { useEvents } from '../lib/useData.js'
import { ymd, fmtTime } from '../lib/date.js'

const EFFORT_OPTS = [
  ['', '— label —'],
  ['nothing', 'nothing'],
  ['warmup', 'warmup'],
  ['easy', 'easy'],
  ['burn', 'burn'],
  ['high_effort', 'high effort'],
  ['max', 'max']
]

export default function ChecklistSheet({ event, day, onClose, onEdit }) {
  const parsed = parseEvent(event)
  const logDate = ymd(day)
  const { byEvent } = useProgress(logDate)
  const remote = byEvent[event.id] || {}

  const [v, setV] = useState({})
  const [expanded, setExpanded] = useState({}) // explicit "show me again" for done sets
  useEffect(() => { setV({}); setExpanded({}) }, [logDate, event.id])
  const cell = (k) => v[k] || remote[k] || {}

  const put = (key, patch) => {
    setV((s) => ({ ...s, [key]: { ...(s[key] || remote[key] || {}), ...patch } }))
    saveProgress(event.id, logDate, key, patch)
  }

  const merged = { ...remote, ...v }
  const { done, total } = completion(parsed, merged)
  const sub = cell('__sub__')

  // ----- swipe-down to dismiss -----
  const sheetRef = useRef(null)
  const drag = useRef({ y0: 0, dy: 0, active: false })
  function onTouchStart(e) {
    const t = e.target
    if (t && t.closest('input, textarea, select, button')) return
    drag.current = { y0: e.touches[0].clientY, dy: 0, active: true }
  }
  function onTouchMove(e) {
    if (!drag.current.active) return
    const dy = e.touches[0].clientY - drag.current.y0
    if (dy > 0) {
      drag.current.dy = dy
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
    }
  }
  function onTouchEnd() {
    if (!drag.current.active) return
    const dy = drag.current.dy
    drag.current.active = false
    if (sheetRef.current) sheetRef.current.style.transform = ''
    if (dy > 110) onClose()
  }

  // ----- routine swap -----
  const allEvents = useEvents().events
  const [pickRoutine, setPickRoutine] = useState(false)
  const gymTemplates = allEvents.filter((e) => e.type === 'gym' && e.id !== event.id)
  async function swap(toEventId) {
    await setGymOverride(logDate, toEventId)
    setPickRoutine(false); onClose()
  }
  async function resetSwap() {
    await clearGymOverride(logDate)
    setPickRoutine(false); onClose()
  }

  // ----- apply a rest value to every set in an exercise -----
  function applyRestToAll(g, value) {
    for (let s = 0; s < g.sets; s++) {
      put(`${g.key}#${s}`, { rest_seconds: value })
    }
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

        <div className="cl-body">
          {parsed.info.map((t, i) => <div className="cl-info" key={i}>{t}</div>)}

          {parsed.groups.map((g) => g.sets > 0 ? (
            <div className="cl-ex" key={g.key}>
              <div className="cl-ex-name">{g.label}</div>
              <div className="cl-sets-v2">
                {Array.from({ length: g.sets }, (_, s) => {
                  const k = `${g.key}#${s}`
                  const c = cell(k)
                  const isCollapsed = c.done && !expanded[k]
                  const restPlaceholder = defaultRestFor(g.label)

                  if (isCollapsed) {
                    return (
                      <button className="cl-set-mini" key={k}
                        onClick={() => setExpanded((e) => ({ ...e, [k]: true }))}>
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
                            if (newDone) setExpanded((e) => ({ ...e, [k]: false }))
                          }}>
                          {c.done ? '✓' : ''}
                        </button>
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
                          <button className="cs-applyall"
                            title="Apply this rest to all sets of this exercise"
                            onClick={() => {
                              const val = c.rest_seconds != null
                                ? Number(c.rest_seconds)
                                : restPlaceholder
                              applyRestToAll(g, val)
                            }}>↧ all</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* one note for the whole exercise */}
              <input className="cl-ex-note" placeholder={`Notes on ${stripNum(g.label)} (optional)`}
                value={cell(g.key).note || ''}
                onChange={(e) => setV((s) => ({ ...s, [g.key]: { ...cell(g.key), note: e.target.value } }))}
                onBlur={(e) => put(g.key, { note: e.target.value || null })} />
            </div>
          ) : (
            <button className={`cl-item ${cell(g.key).done ? 'on' : ''}`} key={g.key}
              onClick={() => put(g.key, { done: !cell(g.key).done })}>
              <span className="cl-box">{cell(g.key).done ? '✓' : ''}</span>
              <span>{g.label}</span>
            </button>
          ))}

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

// "3. Hip thrust — 3 sets × 10–12 reps. Glutes." → "Hip thrust"
function stripNum(label) {
  return label.replace(/^\d+\.\s*/, '').split('—')[0].trim()
}
