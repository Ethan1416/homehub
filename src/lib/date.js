// Tiny date helpers — no external date lib.
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const startOfMonthGrid = (d) => {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  return addDays(first, -first.getDay()) // grid starts on Sunday
}

export const monthMatrix = (d) => {
  const start = startOfMonthGrid(d)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, w * 7 + day))
  )
}

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export const fmtDayLong = (d) =>
  d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

export const fmtMonthYear = (d) =>
  d.toLocaleDateString([], { month: 'long', year: 'numeric' })

export const relTime = (iso) => {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Does an event occur on day `d`? One-off: same calendar day.
// Daily-recurring: every day on/after its start date, using its time-of-day.
export const occursOn = (ev, d) => {
  const s = new Date(ev.starts_at)
  if (ev.recurrence === 'daily') return startOfDay(d) >= startOfDay(s)
  if (ev.recurrence === 'weekly') {
    if (startOfDay(d) < startOfDay(s)) return false
    const dow = d.getDay()
    if (Array.isArray(ev.days_of_week) && ev.days_of_week.length > 0)
      return ev.days_of_week.includes(dow)
    return dow === s.getDay()
  }
  return sameDay(s, d)
}

// Minutes since midnight for stable agenda ordering across recurring events.
export const minutesOfDay = (ev) => {
  if (ev.all_day) return -1
  const s = new Date(ev.starts_at)
  return s.getHours() * 60 + s.getMinutes()
}

// Local YYYY-MM-DD key for a day (used to scope per-occurrence progress).
export const ymd = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// For <input type="datetime-local"> round-tripping in local time.
export const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (s) => new Date(s)
