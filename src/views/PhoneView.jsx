import { useState } from 'react'
import { useEvents, useClaudeStatus, useStreak } from '../lib/useData.js'
import { isConfigured } from '../supabaseClient.js'
import EventModal from '../components/EventModal.jsx'
import ChecklistSheet from '../components/ChecklistSheet.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import CalendarTab from './tabs/CalendarTab.jsx'
import OuraTab from './tabs/OuraTab.jsx'

const TABS = [
  { k: 'tasks', em: '📋', label: 'Tasks' },
  { k: 'calendar', em: '📅', label: 'Calendar' },
  { k: 'oura', em: '💍', label: 'Oura' }
]

export default function PhoneView() {
  const { events } = useEvents()
  const { statuses } = useClaudeStatus()
  const streak = useStreak(events)
  const [selected, setSelected] = useState(new Date())
  const [weekBase, setWeekBase] = useState(new Date())
  const [filter, setFilter] = useState(null)
  const [tab, setTab] = useState('tasks')
  const [modal, setModal] = useState(null)

  return (
    <div className="ph">
      {!isConfigured && <div className="banner">⚠ Supabase not configured</div>}

      <div className="tab-content">
        {tab === 'tasks' && (
          <TasksTab
            events={events} statuses={statuses} streak={streak}
            selected={selected} setSelected={setSelected}
            weekBase={weekBase} setWeekBase={setWeekBase}
            filter={filter} setFilter={setFilter}
            openChecklist={(e) => setModal({ checklist: e })}
          />
        )}
        {tab === 'calendar' && (
          <CalendarTab events={events} selected={selected} setSelected={setSelected}
            switchToTasks={() => setTab('tasks')} />
        )}
        {tab === 'oura' && <OuraTab />}
      </div>

      {tab === 'tasks' && (
        <button className="fab" onClick={() => setModal({ new: true })}>+</button>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.k} className={`tab-btn ${tab === t.k ? 'on' : ''}`}
            onClick={() => setTab(t.k)}>
            <span className="tb-em">{t.em}</span>
            <span className="tb-lb">{t.label}</span>
          </button>
        ))}
      </nav>

      {modal?.checklist && (
        <ChecklistSheet event={modal.checklist} day={new Date(selected)}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ event: modal.checklist })} />
      )}
      {(modal?.new || modal?.event) && (
        <EventModal event={modal.event} defaultDate={new Date(selected)}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
