import { useState } from 'react'
import { useClaudeStatus, useMilestones } from '../../lib/useData.js'
import { MACHINES } from '../../lib/constants.js'
import { relTime } from '../../lib/date.js'

const isStale = (s) =>
  s?.state === 'working' && s.updated_at &&
  Date.now() - new Date(s.updated_at).getTime() > 6 * 60 * 1000

function MachineDetail({ mk, label, status, onBack }) {
  const s = status
  const working = s?.state === 'working' && !isStale(s)
  return (
    <>
      <button className="back-btn" onClick={onBack}>‹ Back</button>

      <div className={`md-hero ${working ? 'on' : ''}`}>
        <div className="md-hero-top">
          <span className={`bigdot ${working ? 'w' : s ? 'i' : 'n'}`} />
          <div className="md-name">{label}</div>
        </div>
        <div className="md-state">{!s ? 'No data yet'
          : working ? 'Working' : 'Idle'}</div>
        <div className="md-when">{s ? `Updated ${relTime(s.updated_at)}` : '—'}</div>
      </div>

      {s && (
        <>
          <div className="md-card">
            <small>Project</small>
            <b>{s.project || '—'}</b>
          </div>

          <div className="md-card">
            <small>{working ? 'Currently doing' : 'Last task'}</small>
            <p>{s.last_task || '—'}</p>
          </div>
        </>
      )}

      <p className="cal-hint">
        {mk === 'mac'
          ? 'Updated automatically by the Claude Code hook on this Mac.'
          : 'Updates once the homehub-hook.ps1 is installed on this machine.'}
      </p>
    </>
  )
}

export default function ClaudeTab() {
  const { statuses } = useClaudeStatus()
  const milestones = useMilestones()
  const [openM, setOpenM] = useState(null)
  const [detail, setDetail] = useState(null) // null | 'mac' | 'pc'

  if (detail) {
    const m = MACHINES[detail]
    const s = statuses.find((x) => x.machine === detail)
    return <MachineDetail mk={detail} label={m.label} status={s}
      onBack={() => setDetail(null)} />
  }

  const anyWorking = statuses.some((s) => s.state === 'working' && !isStale(s))
  const activeM = milestones.find((m) => m.status === 'active') ||
                  milestones.find((m) => m.status === 'pending')

  return (
    <>
      <div className="ora-hdr">
        <div className="ph-greet">Claude Activity</div>
        <div className="ph-stat" style={{ fontSize: 22 }}>
          {anyWorking ? 'Working now' : 'All idle'}
        </div>
      </div>

      {milestones.length > 0 && (
        <div className="ms-wrap">
          <div className="ms-h">
            <small>PassEPPP roadmap</small>
            <b>{activeM ? activeM.title : 'Complete 🎉'}</b>
          </div>
          <div className="ms-track">
            {milestones.map((m, i) => {
              const isLast = i === milestones.length - 1
              return (
                <button key={m.id}
                  className={`ms-step ms-${m.status} ${openM === m.id ? 'open' : ''}`}
                  onClick={() => setOpenM(openM === m.id ? null : m.id)}
                  title={m.title}>
                  <span className="ms-dot">
                    {m.status === 'done' ? '✓' : m.position}
                  </span>
                  {!isLast && <span className={`ms-line ms-line-${m.status}`} />}
                </button>
              )
            })}
          </div>
          {openM && (() => {
            const m = milestones.find((x) => x.id === openM)
            return m ? (
              <div className="ms-detail">
                <b>{m.title}</b>
                {m.description && <p>{m.description}</p>}
                <small>{m.status === 'done' ? 'Completed' : m.status === 'active' ? 'In progress' : 'Up next'} · updated {relTime(m.updated_at)}</small>
              </div>
            ) : null
          })()}
        </div>
      )}

      {Object.entries(MACHINES).map(([mk, m]) => {
        const s = statuses.find((x) => x.machine === mk)
        const working = s?.state === 'working' && !isStale(s)
        return (
          <button className={`cl-card cl-card-btn ${working ? 'on' : ''}`} key={mk}
            onClick={() => setDetail(mk)}>
            <div className="cl-card-top">
              <span className={`bigdot ${working ? 'w' : s ? 'i' : 'n'}`} />
              <div>
                <b>{m.label}</b>
                <small>{!s ? 'no data yet'
                  : working ? 'Working' : 'Idle'}</small>
              </div>
              <span className="cl-chev">›</span>
            </div>
            {s && (
              <div className="cl-card-body">
                <div className="cl-row">
                  <span className="cl-key">Project</span>
                  <span className="cl-val">{s.project || '—'}</span>
                </div>
                <div className="cl-row">
                  <span className="cl-key">{working ? 'Doing' : 'Last task'}</span>
                  <span className="cl-val cl-task cl-task-clip">{s.last_task || '—'}</span>
                </div>
                <div className="cl-row cl-row-when">
                  <span className="cl-key">Updated</span>
                  <span className="cl-val">{relTime(s.updated_at)}</span>
                </div>
              </div>
            )}
          </button>
        )
      })}

      <p className="cal-hint">Tap a machine for the full activity view.</p>
    </>
  )
}
