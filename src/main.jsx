import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import PhoneView from './views/PhoneView.jsx'
import TvView from './views/TvView.jsx'
import UserGate from './components/UserGate.jsx'
import './styles.css'

function showErr(m) {
  let d = document.getElementById('__err')
  if (!d) { d = document.createElement('div'); d.id='__err'
    d.style.cssText='position:fixed;inset:0;z-index:9999;background:#300;color:#fff;font:12px monospace;padding:18px;white-space:pre-wrap;overflow:auto'
    document.body.appendChild(d) }
  d.textContent = 'ERROR: ' + m
}
window.addEventListener('error', (e) => showErr((e.message||'') + '\n' + (e.error?.stack||'')))
window.addEventListener('unhandledrejection', (e) => showErr('promise: ' + (e.reason?.stack || e.reason)))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<UserGate><PhoneView /></UserGate>} />
        <Route path="/tv" element={<TvView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
