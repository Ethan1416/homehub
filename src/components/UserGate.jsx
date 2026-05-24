import { useEffect, useState } from 'react'

// Lightweight per-user separation (no auth). Picks Ethan / Justin once and
// stores it in localStorage. All later hooks scope reads/writes by this user.
const KEY = 'hh_user_v1'

let cached = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
const listeners = new Set()

export function getUser() { return cached }
export function setUser(u) {
  cached = u
  if (u) localStorage.setItem(KEY, u); else localStorage.removeItem(KEY)
  for (const fn of listeners) fn(u)
}
export function useCurrentUser() {
  const [u, setU] = useState(cached)
  useEffect(() => {
    const fn = (nu) => setU(nu)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return u
}

export default function UserGate({ children }) {
  const u = useCurrentUser()
  if (u) return children
  return (
    <div className="ugwrap">
      <div className="ug-logo">🔥</div>
      <div className="ug-title">HomeHub</div>
      <div className="ug-sub">Who's using this?</div>
      <div className="ug-grid">
        <button className="ug-user ug-ethan" onClick={() => setUser('ethan')}>
          <span className="ug-em">E</span>
          <b>Ethan</b>
        </button>
        <button className="ug-user ug-justin" onClick={() => setUser('justin')}>
          <span className="ug-em">J</span>
          <b>Justin</b>
        </button>
      </div>
      <p className="ug-hint">Each person tracks their own gym + Oura data. Tap your name to switch later from the Tasks tab.</p>
    </div>
  )
}
