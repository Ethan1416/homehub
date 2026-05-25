import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import PhoneView from './views/PhoneView.jsx'
import TvView from './views/TvView.jsx'
import UserGate from './components/UserGate.jsx'
import './styles.css'

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
