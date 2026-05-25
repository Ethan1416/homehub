import { useEvents, setGymOverride } from '../lib/useData.js'
import { ymd } from '../lib/date.js'

const dowOrder = (e) => {
  const d = new Date(e.starts_at).getDay()
  return d === 0 ? 7 : d // Mon-Sun (push Sun last)
}
const dowName = (e) =>
  new Date(e.starts_at).toLocaleDateString([], { weekday: 'short' })

export default function RoutinePicker({ day, user = 'ethan', onClose, onBuildCustom }) {
  const { events } = useEvents()
  const gymTemplates = events
    .filter((e) => e.type === 'gym' && e.recurrence === 'weekly')
    .sort((a, b) => dowOrder(a) - dowOrder(b))

  async function pick(eid) {
    await setGymOverride(ymd(day), eid, user)
    onClose()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          Add gym for {day.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </h2>
        <div className="cl-pick-h">Pick a routine</div>
        {gymTemplates.length === 0 && (
          <p className="hint">No gym templates yet. Create one with the + button.</p>
        )}
        {onBuildCustom && (
          <button className="cl-pick-row custom" onClick={onBuildCustom}>
            <b>+ Build a custom workout</b>
            <small>Set your own exercises, sets, and reps for this day only</small>
          </button>
        )}
        {gymTemplates.map((g) => (
          <button className="cl-pick-row" key={g.id} onClick={() => pick(g.id)}>
            <b>{g.title}</b>
            <small>Usually {dowName(g)} · {(g.notes || '').split('\n')[0]}</small>
          </button>
        ))}
        <div className="sheet-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
