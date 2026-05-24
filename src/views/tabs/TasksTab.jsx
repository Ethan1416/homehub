import { useMemo } from 'react'
import { MACHINES } from '../../lib/constants.js'
import { fmtTime, sameDay, addDays, occursOn, minutesOfDay, ymd } from '../../lib/date.js'
import { parseEvent, completion, sessionSummary, EFFORT_LABELS } from '../../lib/checklist.js'
import { useProgress, useGymOverrides } from '../../lib/useData.js'

const PASTELS = [
  { bg: '#eef1fe', bar: '#5b6ef5' },
  { bg: '#fdeaea', bar: '#e5575d' },
  { bg: '#fdf4e1', bar: '#dba032' },
  { bg: '#e7f6ef', bar: '#2fb380' },
  { bg: '#fbe9f2', bar: '#e25aa0' }
]
const isStale = (s) =>
  s?.state === 'working' && s.updated_at &&
  Date.now() - new Date(s.updated_at).getTime() > 6 * 60 * 1000
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const weekOf = (d) => {
  const mon = addDays(d, -((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function TasksTab({
  events, statuses, streak,
  selected, setSelected, weekBase, setWeekBase,
  filter, setFilter, openChecklist, openGymPicker, openWorkout
}) {
  const { byEvent } = useProgress(ymd(selected))
  const overrides = useGymOverrides()

  const dayEvents = useMemo(() => {
    const overrideId = overrides[ymd(selected)]
    let list = events.filter((e) => {
      if (e.id === overrideId) return true                 // always include override
      if (overrideId && e.type === 'gym') return false     // hide other gym today
      return occursOn(e, selected)
    })
    // ensure override is present even if its own recurrence wouldn't trigger today
    if (overrideId && !list.find((e) => e.id === overrideId)) {
      const ov = events.find((e) => e.id === overrideId)
      if (ov) list = [...list, ov]
    }
    return list.sort((a, b) => minutesOfDay(a) - minutesOfDay(b))
  }, [events, selected, overrides])

  const withStatus = dayEvents.map((e) => {
    const prog = byEvent[e.id] || {}
    const { done, total } = completion(parseEvent(e), prog)
    const pct = total ? Math.round((done / total) * 100) : 0
    const status = total === 0 || done === 0 ? 'todo' : done >= total ? 'done' : 'progress'
    const summary = e.type === 'gym' ? sessionSummary(prog) : null
    return { e, done, total, pct, status, summary }
  })
  const counts = {
    todo: withStatus.filter((x) => x.status === 'todo').length,
    progress: withStatus.filter((x) => x.status === 'progress').length,
    done: withStatus.filter((x) => x.status === 'done').length
  }
  const shown = filter ? withStatus.filter((x) => x.status === filter) : withStatus
  const week = weekOf(weekBase)
  const remaining = counts.todo + counts.progress

  const machineDots = Object.entries(MACHINES).map(([mk, m]) => {
    const s = statuses.find((x) => x.machine === mk)
    const working = s?.state === 'working' && !isStale(s)
    return { mk, label: m.label, working, has: !!s }
  })

  return (
    <>
      <div className="ph-top">
        <div className="ph-top-row">
          <div className="ph-top-text">
            <div className="ph-top-greet">{greeting()}, Ethan</div>
            <div className="ph-top-stat">
              You have <span>{remaining} task{remaining === 1 ? '' : 's'}</span> {sameDay(selected, new Date()) ? 'today' : 'this day'}
            </div>
          </div>
          <div className="ph-top-side">
            <div className="streak-chip" title={`${streak}-day streak`}>
              🔥<b>{streak}</b>
            </div>
          </div>
        </div>

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
        <h3>{sameDay(selected, new Date()) ? "Today's Tasks" : selected.toLocaleDateString([], { weekday: 'long' }) + "'s Tasks"}</h3>
        {filter && <button className="see-all" onClick={() => setFilter(null)}>Show all</button>}
      </div>

      {!withStatus.some((x) => x.e.type === 'gym') && (
        <button className="rest-add" onClick={() => openGymPicker(selected)}>
          <span>💪 Rest day —</span>
          <b>Add a gym session?</b>
        </button>
      )}

      <div className="timeline">
        {shown.length === 0 && <div className="empty">Nothing here 🎉</div>}
        {shown.map(({ e, done, total, pct, status, summary }, i) => {
          const p = PASTELS[i % PASTELS.length]
          const desc = (e.notes || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || ''
          return (
            <div className="tl-row" key={e.id}>
              <span className="tl-dot" style={{ borderColor: p.bar }} />
              <button className="task" style={{ background: p.bg }} onClick={() => openChecklist(e)}>
                <div className="task-top">
                  {e.type === 'gym' ? (
                    <span className="task-title-link" role="link" tabIndex={0}
                      onClick={(ev) => { ev.stopPropagation(); openWorkout(e.id) }}>
                      <b>{e.title}</b>
                      <span className="task-jump" style={{ color: p.bar }} aria-label="Jump to workout metrics">↗</span>
                    </span>
                  ) : (
                    <b>{e.title}</b>
                  )}
                  <span className="task-time" style={{ color: p.bar }}>
                    {e.all_day ? 'All day' : fmtTime(e.starts_at)}
                  </span>
                </div>
                {desc && <p className="task-desc">{desc}</p>}
                {total > 0 && (
                  <div className="task-prog">
                    <div className="bar"><i style={{ width: `${pct}%`, background: p.bar }} /></div>
                    <span style={{ color: p.bar }}>{status === 'done' ? '✓ Done' : `${done}/${total}`}</span>
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
