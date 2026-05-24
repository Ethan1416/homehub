import { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from '../../supabaseClient.js'
import { exerciseCatalog, exerciseHistory, nextMilestone, milestoneIncrement, milestonesFor, currentLevel } from '../../lib/workouts.js'
import { PROFILE_BW_LB } from '../../lib/constants.js'

function ExerciseChart({ series, milestones, color = '#5b6ef5' }) {
  if (series.length === 0 && (!milestones || milestones.length === 0)) return null
  const W = 600, H = 220, P = 30
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dates = series.map((s) => new Date(s.date))
  const mDts = (milestones || []).map((m) => new Date(m.projectedDate))
  const minDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
  let maxDate = today
  for (const d of mDts) if (d > maxDate) maxDate = d
  if (dates.length) {
    const ld = dates[dates.length - 1]; if (ld > maxDate) maxDate = ld
  }
  if (maxDate.getTime() === minDate.getTime()) maxDate.setDate(maxDate.getDate() + 14)
  const maxTgt = (milestones || []).reduce((m, x) => Math.max(m, x.weight), 0)
  const allW = series.map((s) => s.maxWeight)
  const yLo = (allW.length ? Math.min(...allW) : 0) * 0.85
  const yHi = Math.max(maxTgt, ...allW, 0) * 1.12 || 100
  const x = (d) => P + ((new Date(d) - minDate) / (maxDate - minDate)) * (W - 2 * P)
  const y = (val) => H - P - ((val - yLo) / Math.max(yHi - yLo, 1)) * (H - 2 * P)
  const pts = series.map((s) => `${x(s.date).toFixed(1)},${y(s.maxWeight).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wo-chart" preserveAspectRatio="xMidYMid meet">
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#dde0eb" strokeWidth="1" />
      {/* horizontal milestone lines */}
      {(milestones || []).map((m, i) => (
        <line key={`l${i}`} x1={P} y1={y(m.weight)} x2={W - P} y2={y(m.weight)}
          stroke={m.kind === 'level' ? '#a13b3f' : '#e5575d'}
          strokeDasharray={m.kind === 'level' ? '6 6' : '4 5'}
          strokeWidth="1.4" />
      ))}
      {series.length >= 2 && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {series.map((s, i) => (
        <circle key={i} cx={x(s.date)} cy={y(s.maxWeight)} r="3.6" fill={color} />
      ))}
      {/* future milestone dots */}
      {(milestones || []).map((m, i) => (
        <g key={`m${i}`}>
          <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="7" fill="#fff"
            stroke={m.kind === 'level' ? '#a13b3f' : '#e5575d'} strokeWidth="2.6" />
          <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="3.2"
            fill={m.kind === 'level' ? '#a13b3f' : '#e5575d'} />
          <text x={x(m.projectedDate)} y={y(m.weight) - 12} fontSize="11"
            fill={m.kind === 'level' ? '#a13b3f' : '#e5575d'} fontWeight="700"
            textAnchor="middle">{m.weight}</text>
        </g>
      ))}
      {/* dates */}
      {dates.length > 0 && (
        <text x={x(dates[0])} y={H - 10} fontSize="11" fill="#8b90a3" textAnchor="middle">
          {dates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      )}
      {dates.length > 1 && (
        <text x={x(dates[dates.length - 1])} y={H - 10} fontSize="11" fill="#8b90a3" textAnchor="middle">
          {dates[dates.length - 1].toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      )}
      {(milestones || []).map((m, i) => (
        <text key={`d${i}`} x={x(m.projectedDate)} y={H - 10} fontSize="10.5"
          fill={m.kind === 'level' ? '#a13b3f' : '#e5575d'} textAnchor="middle">
          {new Date(m.projectedDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  )
}

function ExerciseDetail({ ex, allRows, onBack }) {
  const { series, best, observedRate } = exerciseHistory(ex, allRows)
  const milestones = milestonesFor(ex.name, best, observedRate)
  const level = currentLevel(ex.name, best)
  const last = series[series.length - 1]

  return (
    <>
      <button className="back-btn" onClick={onBack}>‹ Back</button>
      <div className="md-hero">
        <div className="md-name">{ex.display}</div>
        <div className="md-state">
          {best > 0 ? `Best: ${best} lb` : 'No history yet'}
        </div>
        <div className="md-when">
          Level: <b style={{ textTransform: 'capitalize', color: 'var(--accent)' }}>{level}</b>
          {observedRate != null && observedRate > 0 && (
            <>{' '}· your rate: ~{observedRate.toFixed(1)} lb/week</>
          )}
          {last && (
            <>{' '}· last {last.maxWeight} × {last.maxReps} ({new Date(last.date).toLocaleDateString([], { month: 'short', day: 'numeric' })})</>
          )}
        </div>
      </div>

      {milestones.map((m, i) => (
        <div className="wo-card" key={i}>
          <div className="wo-card-h">
            <small>{m.kind === 'level' ? `Promote to ${m.label}` : `Next +${m.label.replace(' lb','')} bump`}</small>
            <b style={{ color: m.kind === 'level' ? '#a13b3f' : '#e5575d' }}>{m.weight} lb</b>
          </div>
          <div className="wo-card-sub">
            ~{Math.round(m.weeks)} week{Math.round(m.weeks) === 1 ? '' : 's'} ·
            projected {new Date(m.projectedDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      ))}

      <div className="wo-card">
        <div className="wo-card-h">
          <small>Progression</small>
          <b>{series.length} session{series.length === 1 ? '' : 's'}</b>
        </div>
        <ExerciseChart series={series} milestones={milestones} />
      </div>

      <p className="cal-hint">
        Standards are bodyweight-scaled for {Math.round(PROFILE_BW_LB)} lb male, 27 yo.
        Light red dot = next small bump · darker red dot = next level threshold.
        Projection blends your observed rate with level-typical gains.
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
