import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import PhoneView from './views/PhoneView.jsx'
import TvView from './views/TvView.jsx'
import PinGate from './components/PinGate.jsx'
import './styles.css'

// TEMP debug: surface any uncaught error on screen
function showErr(msg) {
  let d = document.getElementById('__err')
  if (!d) {
    d = document.createElement('div')
    d.id = '__err'
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#300;color:#fff;font:13px monospace;padding:20px;overflow:auto;white-space:pre-wrap'
    document.body.appendChild(d)
  }
  d.textContent = 'ERROR: ' + msg
}
window.addEventListener('error', (e) => showErr((e.message || '') + '\n' + (e.error?.stack || '')))
window.addEventListener('unhandledrejection', (e) => showErr('promise: ' + (e.reason?.stack || e.reason)))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<PinGate><PhoneView /></PinGate>} />
        <Route path="/tv" element={<TvView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
