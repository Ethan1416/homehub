// Focused single-exercise checklist. One exercise + one set at a time, large
// inputs, no scrolling. Forward/back chevrons jump between exercises and
// "Coming up next" previews what's after.
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEvent, completion, cellState, defaultRestFor } from '../lib/checklist.js'
import { useProgress, saveProgress } from '../lib/useData.js'
import { supabase } from '../supabaseClient.js'
import { ymd, fmtTime, parseYmd } from '../lib/date.js'
import { exerciseCatalog, exerciseHistory, exerciseKey, bestAtReps, recommendedReps, barWeight, perSide } from '../lib/workouts.js'
import { gymVisibleTo } from '../lib/constants.js'

const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()

const EFFORT_OPTS = [
  ['', '— label —'],
  ['warmup', 'warmup'],
  ['easy', 'easy'],
  ['burn', 'burn'],
  ['high_effort', 'high effort'],
  ['max', 'max']
]

export default function FocusedChecklistSheet({ event, day, user = 'ethan', events = [], onClose, openGymPicker, onBuildCustom }) {
  const parsed = parseEvent(event)
  const logDate = ymd(day)
  const { byEvent } = useProgress(logDate, user)
  const remote = byEvent[event.id] || {}

  // History across this user's gym sessions, for the all-time "best at reps" PR.
  const [allRows, setAllRows] = useState([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const since = new Date(); since.setDate(since.getDate() - 730)
      const { data } = await supabase
        .from('progress').select('event_id,item_key,weight,reps,log_date')
        .eq('user_id', user)
        .gte('log_date', since.toISOString().slice(0, 10))
      if (!cancelled) setAllRows(data || [])
    })()
    return () => { cancelled = true }
  }, [event.id, user])
  const catalog = useMemo(
    () => exerciseCatalog((events || []).filter((e) => gymVisibleTo(e, user))),
    [events, user])


  const [v, setV] = useState({})
  const [extra, setExtra] = useState({})   // sets added beyond the routine (key → count)
  useEffect(() => { setV({}); setExtra({}) }, [logDate, event.id])
  const cell = (k) => v[k] || remote[k] || {}
  // total sets to render for a group = routine sets + any added on the fly
  const setsOf = (g) => g.sets + (extra[g.key] || 0)

  const put = (key, patch) => {
    setV((s) => ({ ...s, [key]: { ...(s[key] || remote[key] || {}), ...patch } }))
    saveProgress(event.id, logDate, key, patch, user)
  }

  // ── Allow per-session reorder via localStorage. Keyed by event+date+user.
  const orderKey = `hh_order_${event.id}_${logDate}_${user}`
  const [orderedKeys, setOrderedKeys] = useState(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem(orderKey) || 'null') } catch { return null }
  })

  // Effective groups: gym groups (sets > 0) in user-customised order if set,
  // else parser's default order.
  const groups = useMemo(() => {
    const gymGroups = parsed.groups.filter((g) => g.sets > 0)
    if (!orderedKeys) return gymGroups
    const map = Object.fromEntries(gymGroups.map((g) => [g.key, g]))
    const ordered = orderedKeys.map((k) => map[k]).filter(Boolean)
    // Append any groups not in the saved order (added later)
    for (const g of gymGroups) if (!orderedKeys.includes(g.key)) ordered.push(g)
    return ordered
  }, [parsed.groups, orderedKeys])

  // ── Active exercise index — first one that has any open set.
  const merged = { ...remote, ...v }
  const moved = (r) => !!(r && (r.done || r.skipped))
  function setStates(g) {
    return Array.from({ length: setsOf(g) }, (_, s) => cellState(cell(`${g.key}#${s}`)))
  }
  const firstOpenIdx = groups.findIndex((g) => setStates(g).some((s) => s === 'open'))
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    // When the user lands here for the first time (no manual nav), jump to
    // the first exercise that still has open sets.
    if (firstOpenIdx >= 0) setActiveIdx(firstOpenIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, logDate])

  const activeGroup = groups[activeIdx]
  const { done, total } = completion(parsed, merged)

  // ── Active set index (stateful so filling a set doesn't jump you away).
  // Pills navigate; resets to the first un-logged set when exercise/day changes.
  const [setIdx, setSetIdx] = useState(0)
  useEffect(() => {
    const g = groups[activeIdx]; if (!g) return
    let fo = 0
    for (let s = 0; s < g.sets; s++) {
      if (cellState(cell(`${g.key}#${s}`)) === 'open') { fo = s; break }
    }
    setSetIdx(fo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, event.id, logDate])

  // ── Rest timer. Auto-starts after logging a set (and can be started by hand);
  // when stopped — or when the next set is logged — the elapsed seconds are
  // saved on the upcoming set as rest_seconds ("rest taken before this set").
  const [restStart, setRestStart] = useState(null)
  const [nowTs, setNowTs] = useState(0)
  useEffect(() => {
    if (restStart == null) return
    setNowTs(Date.now())
    const t = setInterval(() => setNowTs(Date.now()), 500)
    return () => clearInterval(t)
  }, [restStart])
  useEffect(() => { setRestStart(null) }, [event.id, logDate, activeIdx])
  const restElapsed = restStart != null ? Math.max(0, Math.round((nowTs - restStart) / 1000)) : 0
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Reorder modal state
  const [reorderOpen, setReorderOpen] = useState(false)

  // For meal items (no sets) — fallback to passing through onClose with a note
  // that the focused mode is best for gym. For now, we just refuse to render
  // non-gym in this component.
  if (parsed.kind !== 'gym' || groups.length === 0) {
    return null
  }

  const states = setStates(activeGroup)
  const nSets = setsOf(activeGroup)
  const activeSetIdx = Math.min(setIdx, Math.max(0, nSets - 1))
  const setKey = `${activeGroup.key}#${activeSetIdx}`
  const setData = cell(setKey)
  const allSetsMoved = states.every((s) => s !== 'open')
  // A set counts as "filled" (→ green) once it has both weight and reps.
  const setFilled = !!(setData.weight && setData.reps) || setData.done

  // All-time best at the prescribed reps + this exercise's session history.
  const catEntry = catalog[exerciseKey(activeGroup.label)]
  const prTarget = recommendedReps(activeGroup.label)
  const pr = bestAtReps(catEntry, allRows, prTarget)
  const bar = barWeight(activeGroup.label)              // 45 for barbell lifts, else null
  const prSide = pr ? perSide(pr.weight, bar) : null
  const history = catEntry ? exerciseHistory(catEntry, allRows).series : []

  // Move to the next un-logged set; if every set is already done, ADD a new
  // one (4 → 5) so you can always keep going. Exercise changes happen via the
  // ‹ › arrows / the "Done with exercise" button, never from here.
  function advance() {
    for (let s = 0; s < nSets; s++) {
      if (s !== activeSetIdx && cellState(cell(`${activeGroup.key}#${s}`)) === 'open') { setSetIdx(s); return }
    }
    setExtra((m) => ({ ...m, [activeGroup.key]: (m[activeGroup.key] || 0) + 1 }))
    setSetIdx(nSets)   // the brand-new last set
  }
  // "Rest" = I finished this set, keep going: log it, start the rest clock, and
  // advance to the next set. If a rest was already running it belonged to this
  // set (rest taken before it), so save it first.
  function restNext() {
    if (restStart != null) put(setKey, { rest_seconds: Math.round((Date.now() - restStart) / 1000) })
    if (setData.weight && setData.reps && !setData.done) put(setKey, { done: true, skipped: false })
    setRestStart(Date.now())
    advance()
  }
  function stopRest() {
    if (restStart != null) put(setKey, { rest_seconds: Math.round((Date.now() - restStart) / 1000) })
    setRestStart(null)
  }
  // "Done with this exercise" = log the current set, then jump to the next
  // exercise (or finish the workout if this was the last one).
  function finishExercise() {
    if (setData.weight && setData.reps && !setData.done) put(setKey, { done: true, skipped: false })
    setRestStart(null)
    if (activeIdx < groups.length - 1) setActiveIdx(activeIdx + 1)
    else onClose()
  }

  // Rest-timer target: researched recommended rest for this movement.
  const recRest = defaultRestFor(activeGroup.label)
  const restColor = restElapsed < recRest ? 'counting'
    : restElapsed < recRest * 1.5 ? 'good' : 'over'

  const next = groups[activeIdx + 1]
  const nextOpen = next ? setStates(next).filter((s) => s === 'open').length : 0
  const dayTitle = event.title.replace(/^[🏋️\s]+/, '').replace(/^Gym\s+[—-]\s+/, '')

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet focused" onClick={(e) => e.stopPropagation()}>
        {/* Header — the routine name reads as the title (tap to change routine) */}
        <div className="fc-head">
          <button className="fc-back" onClick={onClose}>✕</button>
          <button className="fc-day-title" onClick={() => openGymPicker && openGymPicker()}
            title="Change routine">
            {dayTitle} <span className="fc-day-swap">⇄</span>
          </button>
          <button className="fc-back" onClick={() => setReorderOpen(true)} title="Reorder">≡</button>
        </div>

        {/* Mini progress bar */}
        <div className="fc-bar">
          <div className="fc-bar-fill" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>

        {/* Exercise nav — arrows flank the exercise sub-title */}
        <div className="fc-exnav">
          <button className="fc-nav-btn" disabled={activeIdx === 0}
            onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}>‹</button>
          <div className="fc-exnav-mid">
            <h2 className="fc-ex-name">{stripNum(activeGroup.label)}</h2>
            <div className="fc-ex-sub">
              Exercise {activeIdx + 1} of {groups.length} · Set {activeSetIdx + 1} of {nSets}{allSetsMoved ? ' · all done' : ''}
            </div>
          </div>
          <button className="fc-nav-btn" disabled={activeIdx === groups.length - 1}
            onClick={() => setActiveIdx(Math.min(groups.length - 1, activeIdx + 1))}>›</button>
        </div>

        {/* Per-exercise progression dots (tappable; no longer between the arrows) */}
        <div className="fc-dots">
          {groups.map((g, i) => {
            const s = setStates(g)
            const ad = s.length > 0 && s.every((x) => x === 'done')
            const as = s.length > 0 && s.every((x) => x === 'skipped')
            return (
              <button key={g.key}
                className={`fc-dot ${i === activeIdx ? 'on' : ''} ${ad ? 'done' : ''} ${as ? 'skipped' : ''}`}
                onClick={() => setActiveIdx(i)} title={stripNum(g.label)} />
            )
          })}
        </div>

        {/* The one exercise */}
        <div className="fc-ex">
          {/* Per-set selector — tap any set (incl. a finished one) to edit it */}
          {nSets > 1 && (
            <div className="fc-setsel">
              {Array.from({ length: nSets }, (_, i) => {
                const st = cellState(cell(`${activeGroup.key}#${i}`))
                return (
                  <button key={i}
                    className={`fc-sset ${i === activeSetIdx ? 'on' : ''} fc-sset-${st}`}
                    onClick={() => setSetIdx(i)}>
                    {i + 1}{st === 'done' ? '✓' : st === 'skipped' ? '↷' : ''}
                  </button>
                )
              })}
            </div>
          )}
          {pr ? (
            <div className="fc-pr" title={`Best ever at ${prTarget}+ reps`}>
              🏆 Best <b>{pr.weight}</b> total × {pr.reps}
              {prSide != null && <span className="fc-pr-side"> · load <b>{prSide}</b>/side</span>}
              {prTarget ? <span className="fc-pr-tgt"> @ {prTarget}+</span> : null}
            </div>
          ) : prTarget ? (
            <div className="fc-pr fc-pr-empty">No logged set at {prTarget}+ reps yet</div>
          ) : null}
          {bar != null && (
            <div className="fc-pr-hint">Logged weights are total bar load · {bar} lb bar</div>
          )}

          {/* Set inputs — the whole box turns green once weight + reps are in. */}
          <div className={`fc-set ${setFilled ? 'logged' : ''}`}>
            <div className="fc-row fc-row-3">
              <label className="fc-fld">
                <span>weight</span>
                <input inputMode="decimal" placeholder="—" value={setData.weight || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), weight: e.target.value } }))}
                  onBlur={(e) => {
                    const val = e.target.value || null
                    put(setKey, val && cell(setKey).reps ? { weight: val, done: true, skipped: false } : { weight: val })
                  }} />
              </label>
              <label className="fc-fld">
                <span>reps</span>
                <input inputMode="numeric" placeholder="—" value={setData.reps || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), reps: e.target.value } }))}
                  onBlur={(e) => {
                    const val = e.target.value || null
                    put(setKey, val && cell(setKey).weight ? { reps: val, done: true, skipped: false } : { reps: val })
                  }} />
              </label>
              <label className="fc-fld">
                <span>effort</span>
                <select value={setData.effort || ''}
                  onChange={(e) => put(setKey, { effort: e.target.value || null })}>
                  {EFFORT_OPTS.map(([vv, l]) => <option key={vv} value={vv}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="fc-row fc-row-tail">
              <label className="fc-fld fc-fld-half">
                <span>½ reps</span>
                <input inputMode="numeric" placeholder="0" value={setData.half_reps || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), half_reps: e.target.value } }))}
                  onBlur={(e) => put(setKey, { half_reps: e.target.value || null })} />
              </label>
              <div className="fc-tail">
                {restStart == null ? (
                  <button className="fc-rest-btn" onClick={restNext}>⏱ Rest → next set</button>
                ) : (
                  <button className={`fc-rest-run fc-rest-${restColor}`} onClick={stopRest}
                    title="Tap to stop the rest timer">
                    ⏱ {mmss(restElapsed)} <span className="fc-rest-den">/ {mmss(recRest)}</span>
                  </button>
                )}
              </div>
            </div>
            {setData.rest_seconds != null && restStart == null && (
              <div className="fc-rest-prev">rested {mmss(Number(setData.rest_seconds))} before this set</div>
            )}
          </div>

          {/* Exercise-level completion — unambiguous: names the exercise. */}
          <button className="fc-finish" onClick={finishExercise}>
            {activeIdx < groups.length - 1
              ? `✓ Done with ${stripNum(activeGroup.label)} →`
              : '🏁 Finish workout'}
          </button>

          {history.length > 0 && (
            <div className="fc-hist">
              <div className="fc-hist-h">History · {stripNum(activeGroup.label)}</div>
              {history.slice(-6).reverse().map((s) => {
                const side = perSide(s.maxWeight, bar)
                return (
                  <div className="fc-hist-row" key={s.date}>
                    <span className="fc-hist-d">
                      {parseYmd(s.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="fc-hist-w">
                      <b>{s.maxWeight}</b>{side != null ? ` (${side}/side)` : ''} × {s.maxReps}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Coming up next */}
        {next && (
          <div className="fc-up">
            <small>UP NEXT</small>
            <b>{stripNum(next.label)}</b>
            <span>{nextOpen} set{nextOpen === 1 ? '' : 's'} left</span>
          </div>
        )}
        {!next && (
          <div className="fc-up fc-up-done">
            <b>Last exercise · finish strong</b>
          </div>
        )}
      </div>

      {reorderOpen && (
        <ReorderModal groups={groups}
          onCancel={() => setReorderOpen(false)}
          onSave={(newOrder) => {
            const keys = newOrder.map((g) => g.key)
            localStorage.setItem(orderKey, JSON.stringify(keys))
            setOrderedKeys(keys)
            setReorderOpen(false)
          }} />
      )}
    </div>
  )
}

// Drag-to-reorder modal (uses native HTML5 drag).
function ReorderModal({ groups, onCancel, onSave }) {
  const [items, setItems] = useState(groups)
  const dragSrc = useRef(null)

  function onDragStart(idx) { dragSrc.current = idx }
  function onDragOver(e, idx) {
    e.preventDefault()
    if (dragSrc.current == null || dragSrc.current === idx) return
    const next = [...items]
    const [moved] = next.splice(dragSrc.current, 1)
    next.splice(idx, 0, moved)
    dragSrc.current = idx
    setItems(next)
  }
  function move(idx, delta) {
    const newIdx = idx + delta
    if (newIdx < 0 || newIdx >= items.length) return
    const next = [...items]
    const [moved] = next.splice(idx, 1)
    next.splice(newIdx, 0, moved)
    setItems(next)
  }

  return (
    <div className="reorder-scrim" onClick={onCancel}>
      <div className="reorder-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="reorder-head">
          <h3>Reorder exercises</h3>
          <small>For today only · doesn't change the routine template</small>
        </div>
        <div className="reorder-list">
          {items.map((g, idx) => (
            <div key={g.key} className="reorder-row"
              draggable onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}>
              <span className="reorder-handle">≡</span>
              <span className="reorder-name">{stripNum(g.label)}</span>
              <span className="reorder-arrows">
                <button disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
                <button disabled={idx === items.length - 1} onClick={() => move(idx, 1)}>↓</button>
              </span>
            </div>
          ))}
        </div>
        <div className="reorder-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(items)}>Save order</button>
        </div>
      </div>
    </div>
  )
}
