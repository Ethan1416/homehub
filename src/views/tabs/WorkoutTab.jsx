import { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from '../../supabaseClient.js'
import { exerciseCatalog, exerciseHistory, nextMilestone, milestoneIncrement, projectMilestoneDate } from '../../lib/workouts.js'

function ExerciseChart({ series, target, projectedDate, color = '#5b6ef5' }) {
  if (series.length === 0 && target == null) return null
  const W = 600, H = 200, P = 28
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // assemble x-domain: min(first session, today-30d) → max(today, projected)
  const dates = series.map((s) => new Date(s.date))
  const projDt = projectedDate ? new Date(projectedDate) : null
  const minDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
  const maxDate = projDt ? projDt : (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()), today.getTime())) : today)
  if (maxDate.getTime() === minDate.getTime()) maxDate.setDate(maxDate.getDate() + 7)
  const minY = Math.min(...series.map((s) => s.maxWeight), target || Infinity, Infinity)
  const maxY = Math.max(...series.map((s) => s.maxWeight), target || 0, 0)
  const yLo = minY === Infinity ? 0 : minY * 0.9
  const yHi = (maxY || 100) * 1.1
  const x = (d) => P + ((new Date(d) - minDate) / (maxDate - minDate)) * (W - 2 * P)
  const y = (val) => H - P - ((val - yLo) / Math.max(yHi - yLo, 1)) * (H - 2 * P)

  const pts = series.map((s) => `${x(s.date).toFixed(1)},${y(s.maxWeight).toFixed(1)}`).join(' ')
  const tx = projDt ? x(projDt) : null
  const ty = target ? y(target) : null

  // sparse x-axis labels: first, last, projected
  const labels = []
  if (dates.length) labels.push({ d: minDate, t: minDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) })
  if (dates.length > 1) labels.push({ d: dates[dates.length - 1], t: dates[dates.length - 1].toLocaleDateString([], { month: 'short', day: 'numeric' }) })
  if (projDt) labels.push({ d: projDt, t: projDt.toLocaleDateString([], { month: 'short', day: 'numeric' }) })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wo-chart" preserveAspectRatio="xMidYMid meet">
      {/* y baseline */}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#dde0eb" strokeWidth="1" />
      {/* target horizontal line */}
      {target && (
        <line x1={P} y1={ty} x2={W - P} y2={ty} stroke="#e5575d" strokeDasharray="4 5" strokeWidth="1.4" />
      )}
      {/* path */}
      {series.length >= 2 && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* session dots */}
      {series.map((s, i) => (
        <circle key={i} cx={x(s.date)} cy={y(s.maxWeight)} r="3.6" fill={color} />
      ))}
      {/* future target red dot */}
      {target && projDt && (
        <>
          <circle cx={tx} cy={ty} r="6.5" fill="#fff" stroke="#e5575d" strokeWidth="2.5" />
          <circle cx={tx} cy={ty} r="3" fill="#e5575d" />
        </>
      )}
      {/* x labels */}
      {labels.map((l, i) => (
        <text key={i} x={x(l.d)} y={H - 8} fontSize="11"
          fill="#8b90a3" textAnchor="middle">{l.t}</text>
      ))}
      {/* y labels for current best + target */}
      {series.length > 0 && (
        <text x={P} y={y(series[series.length - 1].maxWeight) - 6} fontSize="11"
          fill={color} fontWeight="700">{series[series.length - 1].maxWeight}</text>
      )}
      {target && (
        <text x={W - P} y={ty - 5} fontSize="11"
          fill="#e5575d" fontWeight="700" textAnchor="end">{target}</text>
      )}
    </svg>
  )
}

function ExerciseDetail({ ex, allRows, onBack }) {
  const { series, best } = exerciseHistory(ex, allRows)
  const target = nextMilestone(best, ex.name)
  const projDate = projectMilestoneDate(series, target)
  const inc = milestoneIncrement(ex.name)
  const last = series[series.length - 1]

  return (
    <>
      <button className="back-btn" onClick={onBack}>‹ Back</button>
      <div className="md-hero">
        <div className="md-name">{ex.display}</div>
        <div className="md-state">
          {best > 0 ? `Best: ${best} lb` : 'No history yet'}
        </div>
        {last && (
          <div className="md-when">
            Last session: {last.maxWeight} × {last.maxReps} on {new Date(last.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      <div className="wo-card">
        <div className="wo-card-h">
          <small>Next milestone</small>
          <b style={{ color: '#e5575d' }}>
            {target ? `${target} lb (+${inc})` : `Log a set to set a target`}
          </b>
        </div>
        {target && projDate && (
          <div className="wo-card-sub">
            Projected: {new Date(projDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      <div className="wo-card">
        <div className="wo-card-h">
          <small>Progression</small>
          <b>{series.length} sessions</b>
        </div>
        <ExerciseChart series={series} target={target} projectedDate={projDate} />
      </div>

      <p className="cal-hint">
        Sessions plotted by max weight. Red dashed line = next +{inc} lb milestone;
        red dot = projected date based on your rate of progress.
      </p>
    </>
  )
}

export default function WorkoutTab({ events }) {
  const [allRows, setAllRows] = useState([])
  const [open, setOpen] = useState(null) // exercise name (normalized) when detail open

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    async function load() {
      const since = new Date(); since.setDate(since.getDate() - 180)
      const { data } = await supabase
        .from('progress').select('*')
        .gte('log_date', since.toISOString().slice(0, 10))
      if (!cancelled) setAllRows(data || [])
    }
    load()
    return () => { cancelled = true }
  }, [])

  const catalog = useMemo(() => exerciseCatalog(events), [events])
  const list = useMemo(() => {
    return Object.values(catalog).map((c) => {
      const { series, best } = exerciseHistory(c, allRows)
      return { ...c, series, best, last: series[series.length - 1] }
    }).sort((a, b) => {
      // most-recently-trained first, else alphabetical
      const ad = a.last?.date || ''
      const bd = b.last?.date || ''
      if (ad && bd) return bd.localeCompare(ad)
      if (ad) return -1
      if (bd) return 1
      return a.display.localeCompare(b.display)
    })
  }, [catalog, allRows])

  if (open) {
    const ex = catalog[open]
    if (!ex) {
      setOpen(null)
      return null
    }
    return <ExerciseDetail ex={ex} allRows={allRows} onBack={() => setOpen(null)} />
  }

  return (
    <>
      <div className="ora-hdr">
        <div className="ph-greet">Workout</div>
        <div className="ph-stat" style={{ fontSize: 22 }}>
          {list.length} exercises
        </div>
      </div>

      {list.length === 0 && (
        <p className="cal-hint">No gym templates yet.</p>
      )}

      {list.map((c) => {
        const tgt = nextMilestone(c.best, c.name)
        const inc = milestoneIncrement(c.name)
        return (
          <button className="wo-row" key={c.name} onClick={() => setOpen(c.name)}>
            <div className="wo-row-l">
              <b>{c.display}</b>
              <small>
                {c.best > 0
                  ? `Best ${c.best} lb · ${c.series.length} session${c.series.length === 1 ? '' : 's'}`
                  : 'No history yet'}
              </small>
            </div>
            <div className="wo-row-r">
              {tgt && <span className="wo-tgt">→ {tgt}</span>}
              <span className="cl-chev">›</span>
            </div>
          </button>
        )
      })}
    </>
  )
}
