import { useState } from 'react'
import { PEOPLE } from '../lib/constants.js'
import { saveEvent, deleteEvent } from '../lib/useData.js'

const DOW_LABELS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const fromDateTime = (dateStr, timeStr) => {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, (mo || 1) - 1, da || 1, h || 0, mi || 0, 0, 0)
}

export default function EventModal({ event, defaultDate, onClose }) {
  const initStart = event ? new Date(event.starts_at) : (() => {
    const d = new Date(defaultDate); d.setHours(9, 0, 0, 0); return d
  })()
  const initEnd = event ? new Date(event.ends_at) : (() => {
    const d = new Date(initStart); d.setMinutes(d.getMinutes() + 30); return d
  })()

  const [f, setF] = useState({
    title: event?.title || '',
    owner: event?.owner || 'shared',
    type: event?.type || 'other',
    all_day: event?.all_day || false,
    recurrence: event?.recurrence || 'none',
    days_of_week: event?.days_of_week || [],
    date: toDateInput(initStart),
    time: toTimeInput(initStart),
    notes: event?.notes || ''
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const toggleDow = (n) => setF((s) => ({
    ...s,
    days_of_week: s.days_of_week.includes(n)
      ? s.days_of_week.filter((x) => x !== n)
      : [...s.days_of_week, n].sort((a, b) => a - b)
  }))

  async function submit() {
    if (!f.title.trim()) return
    setBusy(true)
    const start = fromDateTime(f.date, f.time)
    const end = new Date(start); end.setMinutes(end.getMinutes() + 30)
    await saveEvent({
      id: event?.id,
      title: f.title.trim(),
      owner: f.owner,
      type: f.type,
      all_day: f.all_day,
      recurrence: f.recurrence,
      days_of_week: f.recurrence === 'weekly' && f.days_of_week.length ? f.days_of_week : null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
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
          <label>Type</label>
          <div className="chips">
            {[
              ['gym', '🏋️ Gym'],
              ['meal', '🍽️ Meal'],
              ['other', '📅 Other']
            ].map(([k, label]) => (
              <button key={k} className={`chip ${f.type === k ? 'on' : ''}`}
                style={{ color: 'var(--accent)' }} onClick={() => set('type', k)}>
                {label}
              </button>
            ))}
          </div>
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
            <label>Date</label>
            <input type="date" value={f.date}
              onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label>Time</label>
            <input type="time" value={f.time}
              onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>

        <div className="fld">
          <label>Repeat</label>
          <div className="chips">
            <button className={`chip ${f.recurrence !== 'daily' && f.recurrence !== 'weekly' ? 'on' : ''}`}
              style={{ color: 'var(--accent)' }} onClick={() => set('recurrence', 'none')}>
              One-off
            </button>
            <button className={`chip ${f.recurrence === 'daily' ? 'on' : ''}`}
              style={{ color: 'var(--accent)' }} onClick={() => set('recurrence', 'daily')}>
              ↻ Daily (all days)
            </button>
            <button className={`chip ${f.recurrence === 'weekly' ? 'on' : ''}`}
              style={{ color: 'var(--accent)' }} onClick={() => set('recurrence', 'weekly')}>
              ↻ Specific days
            </button>
          </div>
        </div>

        {f.recurrence === 'weekly' && (
          <div className="fld">
            <label>Which days?</label>
            <div className="dow-row">
              {DOW_LABELS.map((lab, i) => (
                <button key={i}
                  className={`dow-btn ${f.days_of_week.includes(i) ? 'on' : ''}`}
                  onClick={() => toggleDow(i)}>{lab}</button>
              ))}
            </div>
            {f.days_of_week.length === 0 && (
              <small className="hint">
                No days selected — will use the weekday of the date above.
              </small>
            )}
          </div>
        )}

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
