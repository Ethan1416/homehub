import { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from '../../supabaseClient.js'
import { exerciseCatalog, exerciseHistory, nextMilestone, milestoneIncrement, milestonesFor, currentLevel } from '../../lib/workouts.js'
import { PROFILE_BW_LB } from '../../lib/constants.js'

function fmtDuration(weeks) {
  if (weeks == null) return '—'
  if (weeks < 1) return 'this week'
  if (weeks < 8) return `${Math.round(weeks)} wk`
  if (weeks < 52) return `${Math.round(weeks / 4.33)} mo`
  const years = weeks / 52
  return years < 10 ? `${years.toFixed(1)} yr` : '10+ yr'
}

// Visual style per milestone status.
const lineStyle = (m) => {
  if (m.status === 'achieved') return { color: '#bfc4d6', dash: '3 6' }
  if (m.kind === 'bump') return { color: '#e5575d', dash: '4 5' }
  // upcoming level — color graded by distance (next = bright red, far = darker)
  return { color: '#a13b3f', dash: '6 6' }
}

function ExerciseChart({ series, milestones, color = '#5b6ef5' }) {
  if (series.length === 0 && (!milestones || milestones.length === 0)) return null
  const W = 600, H = 260, P_L = 38, P_R = 100, P_T = 14, P_B = 28
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dates = series.map((s) => new Date(s.date))
  const futureMs = (milestones || []).filter((m) => m.projectedDate)
  const mDts = futureMs.map((m) => new Date(m.projectedDate))
  const minDate = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
  let maxDate = today
  for (const d of mDts) if (d > maxDate) maxDate = d
  if (dates.length) {
    const ld = dates[dates.length - 1]; if (ld > maxDate) maxDate = ld
  }
  if (maxDate.getTime() === minDate.getTime()) maxDate.setDate(maxDate.getDate() + 14)
  const allLevelWs = (milestones || []).map((m) => m.weight)
  const allW = [...series.map((s) => s.maxWeight), ...allLevelWs]
  const yLo = Math.max(0, Math.min(...allW, 0) * 0.85)
  const yHi = Math.max(...allW, 100) * 1.10
  const x = (d) => P_L + ((new Date(d) - minDate) / (maxDate - minDate)) * (W - P_L - P_R)
  const y = (val) => H - P_B - ((val - yLo) / Math.max(yHi - yLo, 1)) * (H - P_T - P_B)
  const pts = series.map((s) => `${x(s.date).toFixed(1)},${y(s.maxWeight).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wo-chart" preserveAspectRatio="xMidYMid meet">
      <line x1={P_L} y1={H - P_B} x2={W - P_R} y2={H - P_B} stroke="#dde0eb" strokeWidth="1" />

      {/* horizontal milestone lines + right-side labels */}
      {(milestones || []).map((m, i) => {
        const s = lineStyle(m)
        const yy = y(m.weight)
        const label = m.kind === 'bump'
          ? `next +${m.label.replace(' lb','')}`
          : m.label
        return (
          <g key={`l${i}`}>
            <line x1={P_L} y1={yy} x2={W - P_R} y2={yy}
              stroke={s.color} strokeDasharray={s.dash} strokeWidth="1.3" />
            <text x={W - P_R + 6} y={yy + 4} fontSize="10.5"
              fill={s.color}
              fontWeight={m.status === 'achieved' ? 500 : 700}
              style={{ textTransform: 'capitalize' }}>
              {label} {m.weight}{m.status === 'achieved' ? ' ✓' : ''}
            </text>
          </g>
        )
      })}

      {/* series */}
      {series.length >= 2 && (
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
      {series.map((s, i) => (
        <circle key={i} cx={x(s.date)} cy={y(s.maxWeight)} r="3.6" fill={color} />
      ))}

      {/* future-projected dots only for upcoming milestones (skip achieved) */}
      {futureMs.map((m, i) => {
        const s = lineStyle(m)
        return (
          <g key={`m${i}`}>
            <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="6.5" fill="#fff"
              stroke={s.color} strokeWidth="2.4" />
            <circle cx={x(m.projectedDate)} cy={y(m.weight)} r="3"
              fill={s.color} />
            <text x={x(m.projectedDate)} y={H - 10}
              fontSize="10" fill={s.color} textAnchor="middle">
              {new Date(m.projectedDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </text>
          </g>
        )
      })}

      {/* session date labels */}
      {dates.length > 0 && (
        <text x={x(dates[0])} y={H - 10} fontSize="10" fill="#8b90a3" textAnchor="middle">
          {dates[0].toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      )}
      {dates.length > 1 && (
        <text x={x(dates[dates.length - 1])} y={H - 10} fontSize="10" fill="#8b90a3" textAnchor="middle">
          {dates[dates.length - 1].toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </text>
      )}
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

      <div className="wo-card">
        <div className="wo-card-h">
          <small>Progression</small>
          <b>{series.length} session{series.length === 1 ? '' : 's'}</b>
        </div>
        <ExerciseChart series={series} milestones={milestones} />
      </div>

      <div className="wo-mlist">
        {milestones.map((m, i) => {
          const achieved = m.status === 'achieved'
          const isBump = m.kind === 'bump'
          const color = achieved ? '#9ca3b4' : isBump ? '#e5575d' : '#a13b3f'
          const heading = isBump
            ? `Next +${m.label.replace(' lb', '')} bump`
            : m.label
          return (
            <div className={`wo-mrow ${achieved ? 'achieved' : ''}`} key={i}>
              <div className="wo-mrow-l">
                <small style={{ color }}>{heading}{achieved && ' ✓'}</small>
                <b style={{ color }}>{m.weight} lb</b>
              </div>
              <div className="wo-mrow-r">
                {achieved
                  ? <span className="wo-mdate">already there</span>
                  : <>
                      <span className="wo-mdate">{fmtDuration(m.weeks)}</span>
                      <span className="wo-mdate dim">
                        {new Date(m.projectedDate).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                      </span>
                    </>}
              </div>
            </div>
          )
        })}
      </div>

      <p className="cal-hint">
        Standards are bodyweight-scaled for {Math.round(PROFILE_BW_LB)} lb male, 27 yo.
        Faded grey = already achieved · light red = next +increment bump · dark red = level promotion.
        Projection blends your observed weekly rate with level-typical gains.
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
