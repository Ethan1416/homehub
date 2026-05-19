import { useEffect, useMemo, useState } from 'react'
import { useEvents, useClaudeStatus } from '../lib/useData.js'
import { MACHINES, ownerColor } from '../lib/constants.js'
import { sameDay, addDays, fmtTime, relTime, startOfDay } from '../lib/date.js'

const isStale = (s) =>
  s?.state === 'working' && s.updated_at &&
  Date.now() - new Date(s.updated_at).getTime() > 6 * 60 * 1000

// Keep the dongle's browser awake and reconnecting.
function useTvKeepAlive() {
  useEffect(() => {
    let lock
    const acquire = async () => {
      try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen') }
      catch { /* not supported on some dongle browsers — fine */ }
    }
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVis)
    // Full reload daily so a long-running tab never drifts or leaks.
    const reload = setTimeout(() => location.reload(), 24 * 3600 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearTimeout(reload)
      lock?.release?.()
    }
  }, [])
}

export default function TvView() {
  useTvKeepAlive()
  const { events } = useEvents()
  const { statuses } = useClaudeStatus()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = startOfDay(now)
  const todays = useMemo(() =>
    events
      .filter((e) => sameDay(new Date(e.starts_at), today))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
    [events, today.getTime()]
  )
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  return (
    <div className="tv">
      <div className="tv-left">
        <div className="tv-clock">
          <span className="t">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="d">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>

        <div className="tv-section">Today</div>
        <div className="tv-agenda">
          {todays.length === 0 && <div className="tv-empty">Nothing scheduled today 🎉</div>}
          {todays.map((e) => (
            <div className="tv-ev" key={e.id} style={{ borderLeftColor: ownerColor(e.owner) }}>
              <span className="tt">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span>
              <span className="tb">
                {e.title}
                {e.notes && <small>{e.notes}</small>}
              </span>
            </div>
          ))}
        </div>

        <div className="tv-week">
          {week.map((d) => {
            const evs = events.filter((e) => sameDay(new Date(e.starts_at), d))
            return (
              <div key={d.toISOString()} className={`tv-wd ${sameDay(d, today) ? 'today' : ''}`}>
                <div className="wn">{d.toLocaleDateString([], { weekday: 'short' })}</div>
                <div className="wnum">{d.getDate()}</div>
                <div className="wdots">
                  {evs.slice(0, 5).map((e) => (
                    <span className="wdot" key={e.id} style={{ background: ownerColor(e.owner) }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="tv-right">
        <div className="tv-section">Claude</div>
        {Object.entries(MACHINES).map(([mk, m]) => {
          const s = statuses.find((x) => x.machine === mk)
          const working = s?.state === 'working' && !isStale(s)
          return (
            <div className="tv-card" key={mk}>
              <div className="ch">
                <span className={`bigpulse ${working ? 'working' : ''}`} />
                {m.label}
              </div>
              <div className="cstate">{!s ? 'No data yet' : working ? 'Working' : 'Idle'}</div>
              <div className="cproj">{s?.project || '—'}</div>
              {s?.last_task && <div className="ctask">{s.last_task}</div>}
              <div className="cwhen">{s ? `updated ${relTime(s.updated_at)}` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
