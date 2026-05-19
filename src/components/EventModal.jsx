import { useState } from 'react'
import { PEOPLE } from '../lib/constants.js'
import { toLocalInput, fromLocalInput } from '../lib/date.js'
import { saveEvent, deleteEvent } from '../lib/useData.js'

export default function EventModal({ event, defaultDate, onClose }) {
  const init = event || {
    title: '',
    owner: 'shared',
    all_day: false,
    recurrence: 'none',
    starts_at: new Date(defaultDate.setHours(9, 0, 0, 0)).toISOString(),
    ends_at: new Date(defaultDate.setHours(10, 0, 0, 0)).toISOString(),
    notes: ''
  }
  const [f, setF] = useState({
    ...init,
    startLocal: toLocalInput(new Date(init.starts_at)),
    endLocal: toLocalInput(new Date(init.ends_at))
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  async function submit() {
    if (!f.title.trim()) return
    setBusy(true)
    await saveEvent({
      id: event?.id,
      title: f.title.trim(),
      owner: f.owner,
      all_day: f.all_day,
      recurrence: f.recurrence || 'none',
      starts_at: fromLocalInput(f.startLocal).toISOString(),
      ends_at: fromLocalInput(f.endLocal).toISOString(),
      notes: f.notes?.trim() || null
    })
    onClose()
  }
  async function remove() {
    setBusy(true)
    await deleteEvent(event.id)
    onClose()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{event ? 'Edit event' : 'New event'}</h2>

        <div className="fld">
          <label>Title</label>
          <input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)}
            placeholder="Dinner, gym, deploy…" />
        </div>

        <div className="fld">
          <label>Who</label>
          <div className="chips">
            {Object.entries(PEOPLE).map(([k, p]) => (
              <button key={k} className={`chip ${f.owner === k ? 'on' : ''}`}
                style={{ color: p.color }} onClick={() => set('owner', k)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fld row2">
          <div>
            <label>Starts</label>
            <input type="datetime-local" value={f.startLocal}
              onChange={(e) => set('startLocal', e.target.value)} />
          </div>
          <div>
            <label>Ends</label>
            <input type="datetime-local" value={f.endLocal}
              onChange={(e) => set('endLocal', e.target.value)} />
          </div>
        </div>

        <div className="fld">
          <label>Repeat</label>
          <div className="chips">
            <button className={`chip ${f.recurrence !== 'daily' ? 'on' : ''}`}
              style={{ color: 'var(--accent)' }} onClick={() => set('recurrence', 'none')}>
              One-off
            </button>
            <button className={`chip ${f.recurrence === 'daily' ? 'on' : ''}`}
              style={{ color: 'var(--accent)' }} onClick={() => set('recurrence', 'daily')}>
              ↻ Every day
            </button>
          </div>
        </div>

        <div className="fld">
          <label>Notes</label>
          <textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="sheet-actions">
          {event && <button className="btn danger" disabled={busy} onClick={remove}>Delete</button>}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
