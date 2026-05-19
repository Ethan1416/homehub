import { useState } from 'react'

// Lightweight shared-PIN gate for the phone app. Deterrent only — not auth.
// PIN comes from VITE_HOMEHUB_PIN; if unset, the gate is disabled (open).
const PIN = import.meta.env.VITE_HOMEHUB_PIN
const KEY = 'hh_pin_ok_v1'

export default function PinGate({ children }) {
  const [ok, setOk] = useState(() => !PIN || localStorage.getItem(KEY) === '1')
  const [entry, setEntry] = useState('')
  const [shake, setShake] = useState(false)

  if (ok) return children

  const press = (n) => {
    const next = (entry + n).slice(0, 4)
    setEntry(next)
    if (next.length === 4) {
      if (next === String(PIN)) {
        localStorage.setItem(KEY, '1')
        setOk(true)
      } else {
        setShake(true)
        setTimeout(() => { setShake(false); setEntry('') }, 450)
      }
    }
  }

  return (
    <div className="pinwrap">
      <div className="pin-title">HomeHub</div>
      <div className={`pin-dots ${shake ? 'shake' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pd ${i < entry.length ? 'on' : ''}`} />
        ))}
      </div>
      <div className="pin-pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="pk" onClick={() => press(n)}>{n}</button>
        ))}
        <span />
        <button className="pk" onClick={() => press(0)}>0</button>
        <button className="pk del" onClick={() => setEntry(entry.slice(0, -1))}>⌫</button>
      </div>
    </div>
  )
}
