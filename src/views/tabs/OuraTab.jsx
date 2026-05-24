import { useHealth } from '../../lib/useData.js'

const scoreColor = (n) =>
  n == null ? '#bfc4d6'
    : n >= 85 ? '#2fb380'
    : n >= 70 ? '#5b6ef5'
    : n >= 60 ? '#dba032'
    : '#e5575d'

const scoreLabel = (n) =>
  n == null ? '—'
    : n >= 85 ? 'Optimal'
    : n >= 70 ? 'Good'
    : n >= 60 ? 'Fair'
    : 'Pay attention'

function Ring({ score, label }) {
  const v = Math.max(0, Math.min(100, score ?? 0))
  const r = 38, c = 2 * Math.PI * r
  const dash = (v / 100) * c
  const col = scoreColor(score)
  return (
    <div className="ora-ring">
      <svg viewBox="0 0 100 100" width="92" height="92">
        <circle cx="50" cy="50" r={r} stroke="#eef0f7" strokeWidth="9" fill="none" />
        <circle cx="50" cy="50" r={r} stroke={col} strokeWidth="9" fill="none"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 50 50)" />
      </svg>
      <div className="ora-ring-c">
        <b style={{ color: col }}>{score ?? '—'}</b>
        <small>{label}</small>
      </div>
    </div>
  )
}

function Spark({ values, color }) {
  // tiny inline sparkline; values oldest -> newest
  const v = values.filter((x) => x != null)
  if (v.length < 2) return null
  const min = Math.min(...v), max = Math.max(...v)
  const w = 100, h = 26, pad = 2
  const pts = v.map((x, i) => {
    const px = pad + (i / (v.length - 1)) * (w - pad * 2)
    const py = max === min ? h / 2 : h - pad - ((x - min) / (max - min)) * (h - pad * 2)
    return `${px.toFixed(1)},${py.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ width: '100%', height: 26 }}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const hms = (s) => {
  if (s == null) return '—'
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}
const n = (x, suffix = '') => x == null ? '—' : `${Math.round(Number(x))}${suffix}`
const t = (x) => x == null ? '—' : (Number(x) >= 0 ? '+' : '') + Number(x).toFixed(2) + '°C'

export default function OuraTab({ user = 'ethan' }) {
  const rows = useHealth(14, user)
  const today = rows[0]

  if (rows.length === 0) {
    return (
      <>
        <div className="ora-hdr">
          <div className="ph-greet">Vitals</div>
          <div className="ph-stat" style={{ fontSize: 22 }}>Loading…</div>
        </div>
        <div className="oura-empty">
          <div className="oura-emoji">💍</div>
          <h3>Syncing your Oura…</h3>
          <p>Pulling the last 14 days from Oura. This usually takes a few seconds.</p>
        </div>
      </>
    )
  }

  const series = (key) => [...rows].reverse().map((r) => r[key])
  const dayLabel = today
    ? new Date(today.day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    : ''

  return (
    <>
      <div className="ora-hdr">
        <div className="ph-greet">Vitals</div>
        <div className="ph-stat" style={{ fontSize: 22 }}>{dayLabel}</div>
      </div>

      <div className="ora-rings">
        <div className="ora-card">
          <Ring score={today.readiness_score} label="Readiness" />
          <div className="ora-cap">{scoreLabel(today.readiness_score)}</div>
          <Spark values={series('readiness_score')} color={scoreColor(today.readiness_score)} />
        </div>
        <div className="ora-card">
          <Ring score={today.sleep_score} label="Sleep" />
          <div className="ora-cap">{scoreLabel(today.sleep_score)}</div>
          <Spark values={series('sleep_score')} color={scoreColor(today.sleep_score)} />
        </div>
        <div className="ora-card">
          <Ring score={today.activity_score} label="Activity" />
          <div className="ora-cap">{scoreLabel(today.activity_score)}</div>
          <Spark values={series('activity_score')} color={scoreColor(today.activity_score)} />
        </div>
      </div>

      <div className="ora-stats">
        <div className="ora-stat">
          <small>Sleep</small><b>{hms(today.total_sleep_seconds)}</b>
          <Spark values={series('total_sleep_seconds').map((x) => x ? x / 3600 : null)} color="#5b6ef5" />
        </div>
        <div className="ora-stat">
          <small>HRV avg</small><b>{n(today.hrv_avg, ' ms')}</b>
          <Spark values={series('hrv_avg')} color="#2fb380" />
        </div>
        <div className="ora-stat">
          <small>Resting HR</small><b>{n(today.resting_hr, ' bpm')}</b>
          <Spark values={series('resting_hr')} color="#e25aa0" />
        </div>
        <div className="ora-stat">
          <small>Steps</small><b>{n(today.steps)}</b>
          <Spark values={series('steps')} color="#dba032" />
        </div>
        <div className="ora-stat ora-stat-wide">
          <small>Body temp deviation</small><b>{t(today.temp_deviation)}</b>
          <Spark values={series('temp_deviation').map((x) => x == null ? null : Number(x))} color="#ff7a3d" />
        </div>
      </div>

      <p className="cal-hint">Auto-refreshes hourly. Source: Oura Ring.</p>
    </>
  )
}
