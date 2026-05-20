import { useEffect, useMemo, useState } from 'react'
import { useEvents, useClaudeStatus, useProgress, useHealth } from '../lib/useData.js'
import { MACHINES, ownerColor } from '../lib/constants.js'
import { sameDay, addDays, fmtTime, relTime, startOfDay, occursOn, minutesOfDay, ymd } from '../lib/date.js'
import { parseEvent, completion } from '../lib/checklist.js'

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
  const { byEvent } = useProgress(ymd(today))
  const health = useHealth(1)
  const h = health[0]
  const todays = useMemo(() =>
    events
      .filter((e) => occursOn(e, today))
      .sort((a, b) => minutesOfDay(a) - minutesOfDay(b)),
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
          {todays.map((e) => {
            const { done, total } = completion(parseEvent(e), byEvent[e.id] || {})
            const complete = total > 0 && done === total
            return (
            <div className={`tv-ev ${complete ? 'done' : ''}`} key={e.id}
              style={{ borderLeftColor: ownerColor(e.owner) }}>
              <span className="tt">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</span>
              <span className="tb">
                <span className="tb-title">
                  {e.title}
                  {total > 0 && (
                    <span className={`tv-prog ${complete ? 'ok' : ''}`}>
                      {complete ? '✓ done' : `${done}/${total}`}
                    </span>
                  )}
                </span>
                {e.notes && (
                  <small className="notes">
                    {e.notes.split('\n').filter((l) => l.trim()).map((ln, i) => {
                      const ex = /^\d+[.)]\s/.test(ln.trim())
                      const cls = ex ? 'n-ex' : i === 0 ? 'n-hdr' : 'n-line'
                      return <span className={cls} key={i}>{ln.trim()}</span>
                    })}
                  </small>
                )}
              </span>
            </div>
            )
          })}
        </div>

        <div className="tv-week">
          {week.map((d) => {
            const evs = events.filter((e) => occursOn(e, d))
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
        {h && (
          <div className="tv-card tv-vitals">
            <div className="ch">💍 Vitals</div>
            <div className="tv-vrings">
              {[
                ['Readiness', h.readiness_score],
                ['Sleep', h.sleep_score],
                ['Activity', h.activity_score]
              ].map(([lbl, v]) => (
                <div className="tv-vring" key={lbl}>
                  <b style={{ color: v >= 85 ? '#5fd0a0' : v >= 70 ? '#7c9cff' : v >= 60 ? '#ffb454' : '#ff6b6b' }}>
                    {v ?? '—'}
                  </b>
                  <small>{lbl}</small>
                </div>
              ))}
            </div>
            <div className="tv-vstats">
              <span><i>Sleep</i> {h.total_sleep_seconds ? `${Math.floor(h.total_sleep_seconds/3600)}h ${Math.round((h.total_sleep_seconds%3600)/60)}m` : '—'}</span>
              <span><i>HRV</i> {h.hrv_avg != null ? `${Math.round(Number(h.hrv_avg))} ms` : '—'}</span>
              <span><i>Resting HR</i> {h.resting_hr != null ? `${Math.round(Number(h.resting_hr))} bpm` : '—'}</span>
              <span><i>Steps</i> {h.steps?.toLocaleString() || '—'}</span>
            </div>
          </div>
        )}

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
