import { useState } from 'react'
import { ymd } from '../lib/date.js'
import { supabase, isConfigured } from '../supabaseClient.js'
import { setGymOverride } from '../lib/useData.js'

const BLANK_ROW = { name: '', sets: '3', reps: '8-10' }

export default function CustomWorkoutBuilder({ day, user = 'ethan', onClose }) {
  const [title, setTitle] = useState('Custom workout')
  const [rows, setRows] = useState([{ ...BLANK_ROW }])
  const [trailing, setTrailing] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (i, k, v) => setRows((rs) => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows((rs) => [...rs, { ...BLANK_ROW }])
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i))

  async function save() {
    const clean = rows.map((r) => ({
      name: r.name.trim(), sets: parseInt(r.sets, 10) || 3, reps: r.reps.trim() || '8-10'
    })).filter((r) => r.name)
    if (clean.length === 0) return

    setBusy(true)
    const notes = (
      title.toUpperCase() + '\n' +
      clean.map((r, i) => `${i + 1}. ${r.name} — ${r.sets} sets × ${r.reps} reps`).join('\n') +
      (trailing.trim() ? '\n' + trailing.trim() : '')
    )

    const startISO = new Date(day); startISO.setHours(12, 0, 0, 0)
    const endISO = new Date(startISO); endISO.setHours(13, 0, 0, 0)

    const { data, error } = await supabase
      .from('events').insert([{
        title: `🏋️ Gym — ${title}`,
        owner: user, type: 'gym', recurrence: 'none',
        starts_at: startISO.toISOString(),
        ends_at: endISO.toISOString(),
        notes
      }]).select('id')
    if (error || !data?.[0]) { setBusy(false); return }
    await setGymOverride(ymd(day), data[0].id, user)
    onClose()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet cw" onClick={(e) => e.stopPropagation()}>
        <h2>Build a custom workout</h2>
        <div className="fld">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Core + Walk · Push day · Pull · etc." />
        </div>
        <div className="cw-list">
          <div className="cw-h">
            <span>Exercise</span><span>Sets</span><span>Reps</span><span></span>
          </div>
          {rows.map((r, i) => (
            <div className="cw-row" key={i}>
              <input placeholder="e.g. Hanging leg raises" value={r.name}
                onChange={(e) => update(i, 'name', e.target.value)} />
              <input inputMode="numeric" value={r.sets}
                onChange={(e) => update(i, 'sets', e.target.value)} />
              <input value={r.reps} placeholder="8-10"
                onChange={(e) => update(i, 'reps', e.target.value)} />
              <button className="cw-del" onClick={() => removeRow(i)}
                disabled={rows.length === 1}>×</button>
            </div>
          ))}
          <button className="cl-add-set" onClick={addRow}>+ Add another exercise</button>
        </div>
        <div className="fld" style={{ marginTop: 14 }}>
          <label>Trailing note (optional)</label>
          <textarea placeholder="e.g. Cardio: 25 min walk at 2.5 mph, 20% incline."
            value={trailing} onChange={(e) => setTrailing(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
