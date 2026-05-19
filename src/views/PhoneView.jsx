import { useMemo, useState } from 'react'
import { useEvents, useClaudeStatus, useProgress } from '../lib/useData.js'
import { isConfigured } from '../supabaseClient.js'
import { MACHINES } from '../lib/constants.js'
import { fmtTime, sameDay, addDays, occursOn, minutesOfDay, ymd } from '../lib/date.js'
import { parseEvent, completion } from '../lib/checklist.js'
import EventModal from '../components/EventModal.jsx'
import ChecklistSheet from '../components/ChecklistSheet.jsx'

const isStale = (s) =>
  s?.state === 'working' && s.updated_at &&
  Date.now() - new Date(s.updated_at).getTime() > 6 * 60 * 1000

const PASTELS = [
  { bg: '#eef1fe', bar: '#5b6ef5' },
  { bg: '#fdeaea', bar: '#e5575d' },
  { bg: '#fdf4e1', bar: '#dba032' },
  { bg: '#e7f6ef', bar: '#2fb380' },
  { bg: '#fbe9f2', bar: '#e25aa0' }
]
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const weekOf = (d) => {
  const mon = addDays(d, -((d.getDay() + 6) % 7)) // Monday-start
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function PhoneView() {
  const { events } = useEvents()
  const { statuses } = useClaudeStatus()
  const [selected, setSelected] = useState(new Date())
  const [weekBase, setWeekBase] = useState(new Date())
  const [filter, setFilter] = useState(null) // null | todo | progress | done
  const [modal, setModal] = useState(null)

  const { byEvent } = useProgress(ymd(selected))

  const dayEvents = useMemo(() =>
    events.filter((e) => occursOn(e, selected))
      .sort((a, b) => minutesOfDay(a) - minutesOfDay(b)),
    [events, selected])

  const withStatus = dayEvents.map((e) => {
    const { done, total } = completion(parseEvent(e), byEvent[e.id] || {})
    const pct = total ? Math.round((done / total) * 100) : 0
    const status = total === 0 || done === 0 ? 'todo' : done >= total ? 'done' : 'progress'
    return { e, done, total, pct, status }
  })
  const counts = {
    todo: withStatus.filter((x) => x.status === 'todo').length,
    progress: withStatus.filter((x) => x.status === 'progress').length,
    done: withStatus.filter((x) => x.status === 'done').length
  }
  const shown = filter ? withStatus.filter((x) => x.status === filter) : withStatus
  const week = weekOf(weekBase)
  const remaining = counts.todo + counts.progress

  return (
    <div className="ph">
      {!isConfigured && <div className="banner">⚠ Supabase not configured</div>}

      <div className="ph-hd">
        <div className="ph-greet">{greeting()}, Ethan!</div>
        <div className="ph-stat">
          You have <span>{remaining} task{remaining === 1 ? '' : 's'}</span> {sameDay(selected, new Date()) ? 'today' : 'this day'} 👍
        </div>
      </div>

      <div className="ph-claude">
        {Object.entries(MACHINES).map(([mk, m]) => {
          const s = statuses.find((x) => x.machine === mk)
          const working = s?.state === 'working' && !isStale(s)
          return (
            <div className="clab" key={mk}>
              <span className={`pulse ${working ? 'working' : ''}`} />
              <div>
                <b>{m.label}</b>
                <small>{!s ? 'no data' : working ? `working · ${s.project || '—'}` : 'idle'}</small>
              </div>
            </div>
          )
        })}
      </div>

      <div className="cats">
        {[
          ['todo', 'To-Do', '#e5575d', '#fdeaea'],
          ['progress', 'Progress', '#dba032', '#fdf4e1'],
          ['done', 'Done', '#2fb380', '#e7f6ef']
        ].map(([k, label, c, bg]) => (
          <button key={k}
            className={`cat ${filter === k ? 'on' : ''}`}
            onClick={() => setFilter(filter === k ? null : k)}>
            <span className="cat-ic" style={{ background: bg, color: c }}>{counts[k]}</span>
            <span className="cat-lb">{label}</span>
          </button>
        ))}
      </div>

      <div className="ph-week">
        <button className="wk-nav" onClick={() => setWeekBase(addDays(weekBase, -7))}>‹</button>
        <div className="wk-days">
          {week.map((d, i) => (
            <button key={i}
              className={`wk-d ${sameDay(d, selected) ? 'on' : ''} ${sameDay(d, new Date()) ? 'tdy' : ''}`}
              onClick={() => setSelected(new Date(d))}>
              <span className="wk-n">{DOW[i]}</span>
              <span className="wk-num">{d.getDate()}</span>
            </button>
          ))}
        </div>
        <button className="wk-nav" onClick={() => setWeekBase(addDays(weekBase, 7))}>›</button>
      </div>

      <div className="ph-sec">
        <h3>Today's Tasks</h3>
        {filter && <button className="see-all" onClick={() => setFilter(null)}>Show all</button>}
      </div>

      <div className="timeline">
        {shown.length === 0 && <div className="empty">Nothing here 🎉</div>}
        {shown.map(({ e, done, total, pct, status }, i) => {
          const p = PASTELS[i % PASTELS.length]
          const desc = (e.notes || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || ''
          return (
            <div className="tl-row" key={e.id}>
              <span className="tl-dot" style={{ borderColor: p.bar }} />
              <button className="task" style={{ background: p.bg }}
                onClick={() => setModal({ checklist: e })}>
                <div className="task-top">
                  <b>{e.title}</b>
                  <span className="task-time" style={{ color: p.bar }}>
                    {e.all_day ? 'All day' : fmtTime(e.starts_at)}
                  </span>
                </div>
                {desc && <p className="task-desc">{desc}</p>}
                {total > 0 && (
                  <div className="task-prog">
                    <div className="bar"><i style={{ width: `${pct}%`, background: p.bar }} /></div>
                    <span style={{ color: p.bar }}>
                      {status === 'done' ? '✓ Done' : `${done}/${total}`}
                    </span>
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <button className="fab" onClick={() => setModal({ new: true })}>+</button>

      {modal?.checklist && (
        <ChecklistSheet event={modal.checklist} day={new Date(selected)}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ event: modal.checklist })} />
      )}
      {(modal?.new || modal?.event) && (
        <EventModal event={modal.event} defaultDate={new Date(selected)}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
