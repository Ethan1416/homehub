// Focused single-exercise checklist. One exercise + one set at a time, large
// inputs, no scrolling. Forward/back chevrons jump between exercises and
// "Coming up next" previews what's after.
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseEvent, completion, defaultRestFor, cellState } from '../lib/checklist.js'
import { useProgress, saveProgress } from '../lib/useData.js'
import { ymd, fmtTime } from '../lib/date.js'

const stripNum = (label) => label.replace(/^\d+\.\s*/, '').split('—')[0].trim()

const EFFORT_OPTS = [
  ['', '— label —'],
  ['warmup', 'warmup'],
  ['easy', 'easy'],
  ['burn', 'burn'],
  ['high_effort', 'high effort'],
  ['max', 'max']
]

export default function FocusedChecklistSheet({ event, day, user = 'ethan', onClose, onReorder }) {
  const parsed = parseEvent(event)
  const logDate = ymd(day)
  const { byEvent } = useProgress(logDate, user)
  const remote = byEvent[event.id] || {}

  const [v, setV] = useState({})
  useEffect(() => { setV({}) }, [logDate, event.id])
  const cell = (k) => v[k] || remote[k] || {}

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
    return Array.from({ length: g.sets }, (_, s) => cellState(cell(`${g.key}#${s}`)))
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

  // ── Reorder modal state
  const [reorderOpen, setReorderOpen] = useState(false)

  // For meal items (no sets) — fallback to passing through onClose with a note
  // that the focused mode is best for gym. For now, we just refuse to render
  // non-gym in this component.
  if (parsed.kind !== 'gym' || groups.length === 0) {
    return null
  }

  // ── Active set: first open in this exercise (or the highest one if all done)
  const states = setStates(activeGroup)
  const activeSetIdx = (() => {
    const i = states.findIndex((s) => s === 'open')
    return i >= 0 ? i : Math.max(0, activeGroup.sets - 1)
  })()
  const setKey = `${activeGroup.key}#${activeSetIdx}`
  const setData = cell(setKey)
  const restPlaceholder = defaultRestFor(activeGroup.label)
  const allSetsMoved = states.every((s) => s !== 'open')

  function logSet() {
    put(setKey, { done: true, skipped: false })
    // Auto-advance to next exercise when all sets done.
    setTimeout(() => {
      const newStates = states.map((s, i) => i === activeSetIdx ? 'done' : s)
      if (newStates.every((s) => s !== 'open') && activeIdx < groups.length - 1) {
        setActiveIdx((i) => Math.min(i + 1, groups.length - 1))
      }
    }, 100)
  }
  function skipSet() {
    put(setKey, { skipped: true, done: false })
  }
  function skipExercise() {
    for (let s = 0; s < activeGroup.sets; s++) {
      const k = `${activeGroup.key}#${s}`
      const c = cell(k)
      if (!c.done && !c.skipped) put(k, { skipped: true })
    }
    if (activeIdx < groups.length - 1) setActiveIdx(activeIdx + 1)
  }
  function addSet() {
    put(`${activeGroup.key}#${activeGroup.sets}`, { done: false })
    // Note: the new set won't show up immediately because parsed.groups is
    // derived from event.notes. To support inline-added sets, FocusedSheet
    // would need to also count progress rows with #N > parsed sets. We rely
    // on the existing "Add set" pattern from ChecklistSheet for now.
  }

  const next = groups[activeIdx + 1]
  const nextOpen = next ? setStates(next).filter((s) => s === 'open').length : 0

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet focused" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fc-head">
          <button className="fc-back" onClick={onClose}>✕</button>
          <div className="fc-title">
            <small>{event.title.replace(/^[🏋️\s]+/, '').replace(/^Gym\s+[—-]\s+/, '')}</small>
            <b>{activeIdx + 1} <span>of</span> {groups.length}</b>
          </div>
          <button className="fc-back" onClick={() => setReorderOpen(true)} title="Reorder">≡</button>
        </div>

        {/* Mini progress bar */}
        <div className="fc-bar">
          <div className="fc-bar-fill" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>

        {/* Exercise nav (prev / current / next chevrons) */}
        <div className="fc-nav">
          <button className="fc-nav-btn" disabled={activeIdx === 0}
            onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}>‹</button>
          <div className="fc-nav-chips">
            {groups.map((g, i) => {
              const s = setStates(g)
              const ad = s.length > 0 && s.every((x) => x === 'done')
              const as = s.length > 0 && s.every((x) => x === 'skipped')
              return (
                <button key={g.key}
                  className={`fc-dot ${i === activeIdx ? 'on' : ''} ${ad ? 'done' : ''} ${as ? 'skipped' : ''}`}
                  onClick={() => setActiveIdx(i)}
                  title={stripNum(g.label)} />
              )
            })}
          </div>
          <button className="fc-nav-btn" disabled={activeIdx === groups.length - 1}
            onClick={() => setActiveIdx(Math.min(groups.length - 1, activeIdx + 1))}>›</button>
        </div>

        {/* The one exercise */}
        <div className="fc-ex">
          <h2 className="fc-ex-name">{stripNum(activeGroup.label)}</h2>
          <div className="fc-ex-sub">Set {activeSetIdx + 1} of {activeGroup.sets}{allSetsMoved ? ' · all done' : ''}</div>

          {/* Set inputs */}
          <div className="fc-set">
            <div className="fc-row fc-row-3">
              <label className="fc-fld">
                <span>weight</span>
                <input inputMode="decimal" placeholder="—" value={setData.weight || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), weight: e.target.value } }))}
                  onBlur={(e) => put(setKey, { weight: e.target.value || null })} />
              </label>
              <label className="fc-fld">
                <span>reps</span>
                <input inputMode="numeric" placeholder="—" value={setData.reps || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), reps: e.target.value } }))}
                  onBlur={(e) => put(setKey, { reps: e.target.value || null })} />
              </label>
              <label className="fc-fld">
                <span>effort</span>
                <select value={setData.effort || ''}
                  onChange={(e) => put(setKey, { effort: e.target.value || null })}>
                  {EFFORT_OPTS.map(([vv, l]) => <option key={vv} value={vv}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="fc-row fc-row-2">
              <label className="fc-fld">
                <span>½ reps</span>
                <input inputMode="numeric" placeholder="0" value={setData.half_reps || ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), half_reps: e.target.value } }))}
                  onBlur={(e) => put(setKey, { half_reps: e.target.value || null })} />
              </label>
              <label className="fc-fld">
                <span>rest (s)</span>
                <input inputMode="numeric" placeholder={String(restPlaceholder)} value={setData.rest_seconds ?? ''}
                  onChange={(e) => setV((s) => ({ ...s, [setKey]: { ...cell(setKey), rest_seconds: e.target.value } }))}
                  onBlur={(e) => put(setKey, { rest_seconds: e.target.value ? parseInt(e.target.value, 10) : null })} />
              </label>
            </div>
          </div>

          {/* Primary action */}
          <button className="fc-log" onClick={logSet} disabled={setData.done}>
            {setData.done ? '✓ logged' : `✓ Log Set ${activeSetIdx + 1}`}
          </button>

          {/* Secondary actions */}
          <div className="fc-actions">
            <button onClick={skipSet}>↷ Skip set</button>
            <button onClick={skipExercise}>↷↷ Skip rest</button>
            <button onClick={addSet}>+ Add set</button>
          </div>
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
