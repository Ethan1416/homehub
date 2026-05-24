import { useState } from 'react'
import { useEvents, useClaudeStatus, useStreak } from '../lib/useData.js'
import { isConfigured } from '../supabaseClient.js'
import EventModal from '../components/EventModal.jsx'
import ChecklistSheet from '../components/ChecklistSheet.jsx'
import RoutinePicker from '../components/RoutinePicker.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import CalendarTab from './tabs/CalendarTab.jsx'
import WorkoutTab from './tabs/WorkoutTab.jsx'
import ClaudeTab from './tabs/ClaudeTab.jsx'
import OuraTab from './tabs/OuraTab.jsx'
import { IconTasks, IconCalendar, IconWorkout, IconClaude, IconOura } from '../components/Icons.jsx'

const TABS = [
  { k: 'tasks', Icon: IconTasks, label: 'Tasks' },
  { k: 'calendar', Icon: IconCalendar, label: 'Calendar' },
  { k: 'workout', Icon: IconWorkout, label: 'Workout' },
  { k: 'claude', Icon: IconClaude, label: 'Claude' },
  { k: 'oura', Icon: IconOura, label: 'Vitals' }
]

export default function PhoneView() {
  const { events } = useEvents()
  const { statuses } = useClaudeStatus()
  const streak = useStreak(events)
  const [selected, setSelected] = useState(new Date())
  const [weekBase, setWeekBase] = useState(new Date())
  const [filter, setFilter] = useState(null)
  const [tab, setTab] = useState('tasks')
  const [workoutFocus, setWorkoutFocus] = useState(null) // event_id to filter Workout tab to
  const [workoutNav, setWorkoutNav] = useState(null)     // {ex, nonce} — open this exercise on Workout tab
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
            openGymPicker={(day) => setModal({ gymPicker: day })}
          />
        )}
        {tab === 'calendar' && (
          <CalendarTab events={events} selected={selected} setSelected={setSelected}
            switchToTasks={() => setTab('tasks')} />
        )}
        {tab === 'workout' && (
          <WorkoutTab events={events}
            focusedEventId={workoutFocus}
            clearFocus={() => setWorkoutFocus(null)}
            navReq={workoutNav} />
        )}
        {tab === 'claude' && <ClaudeTab />}
        {tab === 'oura' && <OuraTab />}
      </div>

      {tab === 'tasks' && (
        <button className="fab" onClick={() => setModal({ new: true })}>+</button>
      )}

      <nav className="tabbar">
        {TABS.map(({ k, Icon, label }) => (
          <button key={k} className={`tab-btn ${tab === k ? 'on' : ''}`}
            onClick={() => { setTab(k); if (k !== 'workout') setWorkoutFocus(null) }}>
            <span className="tb-ic"><Icon active={tab === k} /></span>
            <span className="tb-lb">{label}</span>
          </button>
        ))}
      </nav>

      {modal?.checklist && (
        <ChecklistSheet event={modal.checklist} day={new Date(selected)}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ event: modal.checklist })}
          onOpenExercise={(ex) => {
            setWorkoutNav({ ex, nonce: Date.now() })
            setTab('workout')
            setModal(null)
          }} />
      )}
      {modal?.gymPicker && (
        <RoutinePicker day={new Date(modal.gymPicker)}
          onClose={() => setModal(null)} />
      )}
      {(modal?.new || modal?.event) && (
        <EventModal event={modal.event} defaultDate={new Date(selected)}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
