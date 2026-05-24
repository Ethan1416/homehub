import { useMemo, useState } from 'react'
import { monthMatrix, fmtMonthYear, sameDay, occursOn } from '../../lib/date.js'
import { ownerColor } from '../../lib/constants.js'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarTab({ events, selected, setSelected, switchToTasks }) {
  const [cursor, setCursor] = useState(new Date(selected))
  const matrix = useMemo(() => monthMatrix(cursor), [cursor])
  const eventsByDay = (d) => events.filter((e) => occursOn(e, d))

  return (
    <>
      <div className="ph-hd" style={{ marginBottom: 12 }}>
        <div className="ph-greet">Calendar</div>
        <div className="ph-stat" style={{ fontSize: 22 }}>{fmtMonthYear(cursor)}</div>
      </div>

      <div className="ph-month" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="wk-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
        <b style={{ flex: 1, textAlign: 'center' }}>{fmtMonthYear(cursor)}</b>
        <button className="wk-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
      </div>

      <div className="grid">
        {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
        {matrix.flat().map((d, i) => {
          const out = d.getMonth() !== cursor.getMonth()
          const evs = eventsByDay(d)
          return (
            <button key={i}
              className={`cell ${out ? 'out' : ''} ${sameDay(d, new Date()) ? 'today' : ''} ${sameDay(d, selected) ? 'sel' : ''}`}
              onClick={() => { setSelected(new Date(d)); switchToTasks() }}>
              <span className="dnum">{d.getDate()}</span>
              <span className="dots">
                {evs.slice(0, 4).map((e) => (
                  <span className="dot" key={e.id} style={{ background: ownerColor(e.owner) }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <p className="cal-hint">Tap a date to view its tasks.</p>
    </>
  )
}
