import { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from '../../supabaseClient.js'
import { occursOn, ymd, addDays, sameDay } from '../../lib/date.js'
import { parseEvent, cellState } from '../../lib/checklist.js'
import { estimateMealCalories, estimateText } from '../../lib/calories.js'
import { catalogByCategory } from '../../lib/foodCatalog.js'
import { addFoodLog, removeFoodLog } from '../../lib/useData.js'
import { burnedFor, bmrFor } from '../../lib/burn.js'
import { useCalorieTrial, TRIAL_DAYS } from '../../lib/premium.jsx'
import { LockedPreview } from '../../components/LockedPreview.jsx'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TREND_DAYS = 14
const VIEWS = [['both', 'In vs out'], ['net', 'Net'], ['eaten', 'Eaten']]
const stripNum = (l) => l.replace(/^\d+\.\s*/, '').trim()
const stripMealSubtitle = (t) => (t.includes(':') ? t.slice(0, t.indexOf(':')).trim() : t)
const weekOf = (d) => {
  const mon = addDays(d, -((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

function mealBreakdown(ev, prog) {
  const parsed = parseEvent(ev)
  const all = parsed.groups.map((g) => {
    const st = cellState(prog[g.key])
    return { label: stripNum(g.label), kcal: estimateText(g.label), done: st === 'done', skipped: st === 'skipped' }
  }).filter((it) => it.kcal > 0)
  // Skipped items weren't eaten → drop them from calories entirely.
  const items = all.filter((it) => !it.skipped)
  const planned = all.length ? items.reduce((s, it) => s + it.kcal, 0) : estimateMealCalories(ev)
  const eaten = items.reduce((s, it) => s + (it.done ? it.kcal : 0), 0)
  return { items, planned, eaten }
}

export default function CaloriesTab({ events, user = 'ethan' }) {
  const [byDate, setByDate] = useState({})
  const [foodByDate, setFoodByDate] = useState({})
  const [selected, setSelected] = useState(new Date())
  const [weekBase, setWeekBase] = useState(new Date())
  const [refresh, setRefresh] = useState(0)
  const [picker, setPicker] = useState(false)
  const [view, setView] = useState('both')
  const [goalModal, setGoalModal] = useState(false)
  const [customKcal, setCustomKcal] = useState(() => localStorage.getItem('hh_cal_goal') || '')
  const [meta, setMeta] = useState({})            // Auth user_metadata: weight_lb, height_in
  const [ouraByDate, setOuraByDate] = useState({}) // log_date -> Oura total_calories burned

  // body metrics (for BMR fallback + workout-burn scaling)
  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getUser().then(({ data }) => setMeta(data?.user?.user_metadata || {}))
  }, [])

  // Oura daily burn from health_daily.raw.activity.total_calories
  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    ;(async () => {
      const since = addDays(new Date(), -(60))
      const { data } = await supabase
        .from('health_daily').select('day,raw')
        .eq('user_id', user).gte('day', ymd(since))
      if (cancelled) return
      const m = {}
      for (const r of data || []) {
        const tc = r.raw?.activity?.total_calories
        if (tc) m[r.day] = tc
      }
      setOuraByDate(m)
    })()
    return () => { cancelled = true }
  }, [user])

  // progress (meal completion + logged sets) over the window
  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    ;(async () => {
      const since = addDays(new Date(), -(60))
      const { data } = await supabase
        .from('progress').select('event_id,item_key,done,skipped,weight,log_date')
        .eq('user_id', user).gte('log_date', ymd(since))
      if (cancelled) return
      const m = {}
      for (const r of data || []) (((m[r.log_date] ||= {})[r.event_id]) ||= {})[r.item_key] = r
      setByDate(m)
    })()
    return () => { cancelled = true }
  }, [user])

  // logged foods over the window (re-fetch after add/remove)
  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false
    ;(async () => {
      const since = addDays(new Date(), -(60))
      const { data } = await supabase
        .from('food_log').select('*')
        .eq('user_id', user).gte('log_date', ymd(since))
        .order('created_at', { ascending: true })
      if (cancelled) return
      const m = {}
      for (const r of data || []) (m[r.log_date] ||= []).push(r)
      setFoodByDate(m)
    })()
    return () => { cancelled = true }
  }, [user, refresh])

  const foodKcal = (key) => (foodByDate[key] || []).reduce((s, f) => s + (f.kcal || 0), 0)

  // working sets logged on a day (done set-cells with a weight) across gym events
  const setsForDay = (d, key) => {
    let n = 0
    for (const e of events) {
      if (e.type !== 'gym' || !occursOn(e, d)) continue
      const cells = (byDate[key] || {})[e.id] || {}
      for (const k in cells) if (k.includes('#') && cells[k]?.done && cells[k]?.weight) n++
    }
    return n
  }

  const dayTotals = (d) => {
    const key = ymd(d)
    const meals = events.filter((e) => e.type === 'meal' && occursOn(e, d))
    let eaten = 0, planned = 0
    for (const e of meals) {
      const b = mealBreakdown(e, (byDate[key] || {})[e.id] || {})
      eaten += b.eaten; planned += b.planned
    }
    eaten += foodKcal(key)               // logged extra/substitute foods count as eaten
    const burned = burnedFor({ ouraTotal: ouraByDate[key], sets: setsForDay(d, key), meta })
    return { eaten: Math.round(eaten), planned: Math.round(planned), burned }
  }

  const trend = useMemo(() => {
    const today = new Date()
    return Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = addDays(today, -(TREND_DAYS - 1 - i))
      return { d, ...dayTotals(d) }
    })
  }, [events, byDate, foodByDate, ouraByDate, meta])

  const selKey = ymd(selected)
  const sel = useMemo(() => {
    const meals = events
      .filter((e) => e.type === 'meal' && occursOn(e, selected))
      .map((e) => ({ ev: e, ...mealBreakdown(e, (byDate[selKey] || {})[e.id] || {}) }))
      .filter((m) => m.planned > 0)
    const mealEaten = meals.reduce((s, m) => s + m.eaten, 0)
    const planned = meals.reduce((s, m) => s + m.planned, 0)
    return { meals, mealEaten: Math.round(mealEaten), planned: Math.round(planned) }
  }, [events, byDate, selected])

  const selFoods = foodByDate[selKey] || []
  const selEaten = sel.mealEaten + foodKcal(selKey)
  const selBurned = burnedFor({ ouraTotal: ouraByDate[selKey], sets: setsForDay(selected, selKey), meta })
  const selNet = selEaten - selBurned
  const ouraDay = !!ouraByDate[selKey]

  // #5 — nutrition recommendation from logged intake vs the user's goal target.
  const goal = meta.goal || 'maintain'
  const tdee = selBurned || bmrFor(meta)
  const target = customKcal ? parseInt(customKcal) : Math.round(goal === 'cut' ? tdee - 400 : goal === 'bulk' ? tdee + 300 : tdee)
  const goalWord = goal === 'cut' ? 'fat-loss' : goal === 'bulk' ? 'muscle-gain' : 'maintenance'
  const remaining = target - selEaten
  const nutritionRec = selEaten === 0
    ? `Aim for ~${target.toLocaleString()} kcal today for your ${goalWord} goal.`
    : remaining > 200 ? `~${remaining.toLocaleString()} kcal left for your ${goalWord} target (${target.toLocaleString()}).`
    : remaining < -150 ? `${Math.abs(remaining).toLocaleString()} kcal over your ${goalWord} target — lighter dinner tonight.`
    : `On target for ${goalWord} today 👍 (${target.toLocaleString()} kcal).`

  async function add(food) { await addFoodLog(food, selKey, 'extra', user); setRefresh((n) => n + 1) }
  async function remove(id) { await removeFoodLog(id); setRefresh((n) => n + 1) }

  const trial = useCalorieTrial()
  const week = weekOf(weekBase)
  const isToday = sameDay(selected, new Date())
  const avg7 = (() => {
    const last7 = trend.slice(-7).filter((x) => x.eaten > 0)
    return last7.length ? Math.round(last7.reduce((s, x) => s + x.eaten, 0) / last7.length) : 0
  })()

  return (
    <>
      {goalModal && (
        <div className="cal-goal-overlay" onClick={() => setGoalModal(false)}>
          <div className="cal-goal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-goal-title">Daily calorie goal</div>
            <div className="cal-goal-presets">
              <button className={`cal-goal-preset ${!customKcal && goal === 'cut' ? 'on' : ''}`}
                onClick={() => { setCustomKcal(String(Math.round(tdee - 400))); localStorage.setItem('hh_cal_goal', String(Math.round(tdee - 400))) }}>
                <b>Deficit</b><span>~{Math.round(tdee - 400).toLocaleString()} kcal</span>
              </button>
              <button className={`cal-goal-preset ${!customKcal && goal === 'maintain' ? 'on' : ''}`}
                onClick={() => { setCustomKcal(String(Math.round(tdee))); localStorage.setItem('hh_cal_goal', String(Math.round(tdee))) }}>
                <b>Maintain</b><span>~{Math.round(tdee).toLocaleString()} kcal</span>
              </button>
              <button className={`cal-goal-preset ${!customKcal && goal === 'bulk' ? 'on' : ''}`}
                onClick={() => { setCustomKcal(String(Math.round(tdee + 300))); localStorage.setItem('hh_cal_goal', String(Math.round(tdee + 300))) }}>
                <b>Bulk</b><span>~{Math.round(tdee + 300).toLocaleString()} kcal</span>
              </button>
            </div>
            <div className="cal-goal-manual">
              <label>Or enter manually</label>
              <div className="cal-goal-row">
                <input type="number" inputMode="numeric" value={customKcal}
                  placeholder={String(target)}
                  onChange={e => { setCustomKcal(e.target.value); localStorage.setItem('hh_cal_goal', e.target.value) }} />
                <span>kcal / day</span>
              </div>
            </div>
            <button className="cal-goal-done" onClick={() => setGoalModal(false)}>Done</button>
          </div>
        </div>
      )}

      <div className="ora-hdr">
        <div className="ph-greet">Calories</div>
        <button className="cal-gear" onClick={() => setGoalModal(true)} title="Set calorie goal">⚙</button>
        <div className="cal-io">
          <div className="cal-io-cell"><span className="cal-io-n" style={{ color: 'var(--accent)' }}>
            {selEaten.toLocaleString()}</span><span className="cal-io-l">in</span></div>
          <div className="cal-io-cell"><span className="cal-io-n" style={{ color: 'var(--warn)' }}>
            {selBurned.toLocaleString()}</span><span className="cal-io-l">out</span></div>
          <div className="cal-io-cell"><span className="cal-io-n"
            style={{ color: selNet <= 0 ? 'var(--good)' : 'var(--text)' }}>
            {selNet > 0 ? '+' : ''}{selNet.toLocaleString()}</span>
            <span className="cal-io-l">{selNet <= 0 ? 'deficit' : 'surplus'}</span></div>
        </div>
      </div>

      <div className="cal-rec">🍎 {nutritionRec}</div>

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

      {!trial.premium && !trial.locked && (
        <div className="cal-trial">🔓 Calorie tracking is free for {trial.daysLeft} more day{trial.daysLeft === 1 ? '' : 's'}.</div>
      )}

      {(() => {
        const body = (
      <><div className="cal-chart-card">
        <div className="cal-views">
          {VIEWS.map(([k, label]) => (
            <button key={k} className={`cal-view ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        <LineDot data={trend} view={view} selected={selected}
          onPick={(d) => { setSelected(new Date(d)); setWeekBase(new Date(d)) }} />
        <div className="cal-chart-legend">
          {view === 'both' && (<>
            <span className="cal-lg"><i style={{ background: 'var(--accent)' }} />in</span>
            <span className="cal-lg"><i style={{ background: 'var(--warn)' }} />out</span>
          </>)}
          {view === 'net' && <span>Below the line = calorie deficit</span>}
          {view === 'eaten' && <span>7-day avg <b style={{ color: 'var(--text)' }}>{avg7.toLocaleString()}</b> kcal/day</span>}
        </div>
      </div>

      <div className="cal-log">
        <div className="cal-log-h">
          {isToday ? 'Eaten today' : selected.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          <span>{selEaten.toLocaleString()} kcal</span>
        </div>

        {sel.meals.length === 0 && selFoods.length === 0 && (
          <div className="cal-log-empty">No meals scheduled this day. Add a food below.</div>
        )}

        {sel.meals.map((m) => (
          <div className="cal-meal" key={m.ev.id}>
            <div className="cal-meal-top">
              <b>{stripMealSubtitle(m.ev.title)}</b>
              <span className={m.eaten ? 'on' : ''}>
                {m.eaten ? `${Math.round(m.eaten)} kcal` : `0 / ${Math.round(m.planned)}`}
              </span>
            </div>
            <div className="cal-items">
              {m.items.map((it, i) => (
                <div className={`cal-item ${it.done ? 'eaten' : ''}`} key={i}>
                  <span className="cal-item-tick">{it.done ? '✓' : '○'}</span>
                  <span className="cal-item-name">{it.label}</span>
                  <span className="cal-item-kcal">{it.kcal} kcal</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Logged extra / substitute foods */}
        {selFoods.length > 0 && (
          <div className="cal-meal">
            <div className="cal-meal-top"><b>Added foods</b>
              <span className="on">{foodKcal(selKey)} kcal</span></div>
            <div className="cal-items">
              {selFoods.map((f) => (
                <div className="cal-item eaten" key={f.id}>
                  <span className="cal-item-tick">✓</span>
                  <span className="cal-item-name">{f.name}</span>
                  <span className="cal-item-kcal">{f.kcal} kcal</span>
                  <button className="cal-food-del" onClick={() => remove(f.id)} title="Remove">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="cal-addfood" onClick={() => setPicker(true)}>+ Add a food</button>
      </div></>
        )
        return trial.locked
          ? <LockedPreview title="Calorie tracking" sub={`Your ${TRIAL_DAYS}-day free trial ended`}>{body}</LockedPreview>
          : body
      })()}

      <p className="cal-hint">
        In = your meals (USDA FoodData Central) + foods you log. Out = {ouraDay ? 'Oura’s daily burn' : 'your resting burn'}
        {' '}plus an estimate for the day’s lifting (Oura under-counts heavy sets). Tap “Add a food” to log extras.
      </p>

      {picker && (
        <FoodPicker onClose={() => setPicker(false)} onAdd={add}
          dayLabel={isToday ? 'today' : selected.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} />
      )}
    </>
  )
}

function FoodPicker({ onClose, onAdd, dayLabel }) {
  const groups = catalogByCategory()
  const [added, setAdded] = useState({}) // name -> count just added (for feedback)
  function pick(f) {
    onAdd(f)
    setAdded((a) => ({ ...a, [f.name]: (a[f.name] || 0) + 1 }))
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet cl" onClick={(e) => e.stopPropagation()}>
        <div className="cl-head">
          <div>
            <h2>Add a food</h2>
            <div className="cl-sub">Logs to {dayLabel} · tap to add (tap again for seconds)</div>
          </div>
        </div>
        <div className="cl-body">
          {groups.map(([cat, items]) => (
            <div className="fp-group" key={cat}>
              <div className="fp-cat">{cat}</div>
              {items.map((f) => (
                <button className="fp-row" key={f.name} onClick={() => pick(f)}>
                  <span className="fp-name">{f.name}{added[f.name] ? ` ×${added[f.name]}` : ''}</span>
                  <span className="fp-macros">P{f.protein} · C{f.carbs} · F{f.fat}</span>
                  <span className="fp-kcal">{f.kcal}</span>
                  <span className={`fp-add ${added[f.name] ? 'on' : ''}`}>{added[f.name] ? '✓' : '+'}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="sheet-actions">
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

function LineDot({ data, view = 'both', selected, onPick }) {
  const W = 320, H = 150, PL = 38, PR = 10, PT = 16, PB = 24
  const x = (i) => PL + (i / Math.max(data.length - 1, 1)) * (W - PL - PR)
  const yLabels = (max) => {
    const step = max > 3000 ? 1000 : max > 1500 ? 500 : 500
    const count = Math.floor(max / step)
    return Array.from({ length: count + 1 }, (_, i) => i * step).filter(v => v <= max)
  }
  const selIdx = data.findIndex((d) => sameDay(d.d, selected))
  const dateLabels = (yPos) => [0, data.length - 1].map((i) => (
    <text key={i} x={x(i)} y={yPos} fontSize="9.5" fill="var(--muted)"
      textAnchor={i === 0 ? 'start' : 'end'}>
      {data[i].d.toLocaleDateString([], { month: 'short', day: 'numeric' })}
    </text>
  ))

  // NET view: bars of (eaten − burned); below the zero line = deficit (green).
  if (view === 'net') {
    const nets = data.map((d) => d.eaten - d.burned)
    const mag = Math.max(1, ...nets.map((n) => Math.abs(n)))
    const zeroY = PT + (H - PT - PB) / 2
    const yScale = (H - PT - PB) / 2 / mag
    const bw = (W - PL - PR) / data.length * 0.6
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="cal-line-svg" preserveAspectRatio="xMidYMid meet">
        <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY} stroke="var(--line)" strokeWidth="1" />
        {yLabels(mag).map(v => v !== 0 && [
          <line key={`gl${v}`} x1={PL} y1={zeroY - v * (H - PT - PB) / 2 / mag} x2={W - PR} y2={zeroY - v * (H - PT - PB) / 2 / mag} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="3,3" />,
          <text key={`tl${v}`} x={PL - 4} y={zeroY - v * (H - PT - PB) / 2 / mag + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{v >= 1000 ? `${v/1000}k` : v}</text>,
          <line key={`gl-${v}`} x1={PL} y1={zeroY + v * (H - PT - PB) / 2 / mag} x2={W - PR} y2={zeroY + v * (H - PT - PB) / 2 / mag} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="3,3" />,
          <text key={`tl-${v}`} x={PL - 4} y={zeroY + v * (H - PT - PB) / 2 / mag + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{v >= 1000 ? `${v/1000}k` : v}</text>
        ])}
        {data.map((d, i) => {
          const n = nets[i]
          if (!d.eaten && !d.burned) return null
          const h = Math.abs(n) * yScale
          const yTop = n >= 0 ? zeroY - h : zeroY
          const on = i === selIdx
          const col = n <= 0 ? 'var(--good)' : 'var(--warn)'
          return (
            <g key={i} onClick={() => onPick(d.d)} style={{ cursor: 'pointer' }}>
              <rect x={x(i) - bw / 2} y={yTop} width={bw} height={Math.max(h, 1)} rx="2"
                fill={col} opacity={on ? 1 : 0.55} />
            </g>
          )
        })}
        {dateLabels(H - 8)}
      </svg>
    )
  }

  // BOTH / EATEN line views.
  const showBurn = view === 'both'
  const max = Math.max(1, ...data.map((x) => Math.max(x.eaten, showBurn ? x.burned : x.planned)))
  const y = (v) => H - PB - (v / max) * (H - PT - PB)
  const line = (key) => data.map((d, i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cal-line-svg" preserveAspectRatio="xMidYMid meet">
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--line)" strokeWidth="1" />
      {yLabels(max).map(v => v > 0 && [
        <line key={`gl${v}`} x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="3,3" />,
        <text key={`tl${v}`} x={PL - 4} y={y(v) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{v >= 1000 ? `${v/1000}k` : v}</text>
      ])}
      {!showBurn && data.map((d, i) => d.planned > 0 && (
        <circle key={`p${i}`} cx={x(i)} cy={y(d.planned)} r="2" fill="var(--panel-2)"
          stroke="var(--line)" strokeWidth="1" />
      ))}
      {showBurn && (
        <polyline points={line('burned')} fill="none" stroke="var(--warn)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      <polyline points={line('eaten')} fill="none" stroke="var(--accent)"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {showBurn && data.map((d, i) => (
        <circle key={`b${i}`} cx={x(i)} cy={y(d.burned)} r={i === selIdx ? 4.5 : 2.6}
          fill="var(--warn)" stroke={i === selIdx ? '#fff' : 'none'} strokeWidth={i === selIdx ? 1.5 : 0} />
      ))}
      {data.map((d, i) => {
        const on = i === selIdx
        return (
          <g key={i} onClick={() => onPick(d.d)} style={{ cursor: 'pointer' }}>
            <circle cx={x(i)} cy={y(d.eaten)} r="12" fill="transparent" />
            <circle cx={x(i)} cy={y(d.eaten)} r={on ? 6 : 3.6}
              fill={on ? 'var(--good)' : 'var(--accent)'} stroke="#fff" strokeWidth={on ? 2 : 0} />
          </g>
        )
      })}
      {dateLabels(H - 8)}
    </svg>
  )
}
