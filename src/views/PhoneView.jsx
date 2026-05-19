import { useMemo, useState } from 'react'
import { useEvents, useClaudeStatus } from '../lib/useData.js'
import { isConfigured } from '../supabaseClient.js'
import { PEOPLE, MACHINES, ownerColor, ownerLabel } from '../lib/constants.js'
import {
  monthMatrix, fmtMonthYear, fmtDayLong, fmtTime, sameDay, addDays, relTime
} from '../lib/date.js'
import EventModal from '../components/EventModal.jsx'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const isStale = (s) =>
  s?.state === 'working' && s.updated_at &&
  Date.now() - new Date(s.updated_at).getTime() > 6 * 60 * 1000

export default function PhoneView() {
  const { events } = useEvents()
  const { statuses } = useClaudeStatus()
  const [cursor, setCursor] = useState(new Date())
  const [selected, setSelected] = useState(new Date())
  const [modal, setModal] = useState(null) // {event} | {new:true}

  const matrix = useMemo(() => monthMatrix(cursor), [cursor])
  const eventsByDay = (d) =>
    events.filter((e) => sameDay(new Date(e.starts_at), d))
  const dayEvents = eventsByDay(selected)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  return (
    <div className="phone">
      {!isConfigured && (
        <div className="banner">⚠ Supabase not configured — calendar is read-only preview</div>
      )}

      <div className="ph-head">
        <div className="ph-title">HomeHub</div>
      </div>

      <div className="claudestrip">
        {Object.entries(MACHINES).map(([mk, m]) => {
          const s = statuses.find((x) => x.machine === mk)
          const working = s?.state === 'working' && !isStale(s)
          return (
            <div className="cs-card" key={mk}>
              <div className="cs-top">
                <span className={`pulse ${working ? 'working' : ''}`} />
                {m.label}
              </div>
              <div className="cs-sub">
                {!s ? 'no data yet'
                  : working ? `working · ${s.project || '—'}`
                  : `idle · ${s.last_task || 'no recent task'}`}
              </div>
            </div>
          )
        })}
      </div>

      <div className="ph-month">
        <button className="navbtn" onClick={() => setCursor(addDays(new Date(cursor.getFullYear(), cursor.getMonth(), 1), -1))}>‹</button>
        <b>{fmtMonthYear(cursor)}</b>
        <button className="navbtn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
      </div>

      <div className="grid">
        {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
        {matrix.flat().map((d, i) => {
          const out = d.getMonth() !== cursor.getMonth()
          const evs = eventsByDay(d)
          return (
            <button key={i}
              className={`cell ${out ? 'out' : ''} ${sameDay(d, new Date()) ? 'today' : ''} ${sameDay(d, selected) ? 'sel' : ''}`}
              onClick={() => setSelected(new Date(d))}>
              <span className="dnum">{d.getDate()}</span>
              <span className="dots">
                {evs.slice(0, 4).map((e) => (
                  <span className="dot" key={e.id}
                    style={{ background: ownerColor(e.owner) }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="agenda">
        <h3>{fmtDayLong(selected)}</h3>
        {dayEvents.length === 0 && <div className="empty">Nothing scheduled</div>}
        {dayEvents.map((e) => (
          <button key={e.id} className="evrow" style={{ borderLeftColor: ownerColor(e.owner) }}
            onClick={() => setModal({ event: e })}>
            <span className="et">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span>
            <span className="eb">
              <b>{e.title}</b>
              <p>{ownerLabel(e.owner)}{e.notes ? ` · ${e.notes}` : ''}</p>
            </span>
          </button>
        ))}
      </div>

      <button className="fab" onClick={() => setModal({ new: true })}>+</button>

      {modal && (
        <EventModal
          event={modal.event}
          defaultDate={new Date(selected)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
