import { useState, useEffect, useRef } from 'react'
import { isWidgetWorkoutLaunch } from '../lib/nativeBridge.js'
import { useEvents, useClaudeStatus, useStreak } from '../lib/useData.js'
import { ymd } from '../lib/date.js'
import { isConfigured } from '../supabaseClient.js'
import EventModal from '../components/EventModal.jsx'
import ChecklistSheet from '../components/ChecklistSheet.jsx'
import FocusedChecklistSheet from '../components/FocusedChecklistSheet.jsx'
import RoutinePicker from '../components/RoutinePicker.jsx'
import CustomWorkoutBuilder from '../components/CustomWorkoutBuilder.jsx'
import { useCurrentUser, useDisplayName } from '../components/UserGate.jsx'
import ProfileSheet from '../components/ProfileSheet.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import CalendarTab from './tabs/CalendarTab.jsx'
import WorkoutTab from './tabs/WorkoutTab.jsx'
import CaloriesTab from './tabs/CaloriesTab.jsx'
import OuraTab from './tabs/OuraTab.jsx'
import { IconTasks, IconCalendar, IconWorkout, IconCalories, IconOura } from '../components/Icons.jsx'

const ALL_TABS = [
  { k: 'tasks', Icon: IconTasks, label: 'Tasks' },
  { k: 'workout', Icon: IconWorkout, label: 'Workout' },
  { k: 'calories', Icon: IconCalories, label: 'Calories' },
  { k: 'oura', Icon: IconOura, label: 'Vitals' },
  { k: 'calendar', Icon: IconCalendar, label: 'Calendar' }
]

export default function PhoneView() {
  const user = useCurrentUser() || 'ethan'
  const displayName = useDisplayName()
  const { events, loading: eventsLoading } = useEvents()
  const { statuses } = useClaudeStatus()
  const streak = useStreak(events, user)
  const [selected, setSelected] = useState(new Date())
  const [weekBase, setWeekBase] = useState(new Date())
  const [filter, setFilter] = useState(null)
  const [tab, setTab] = useState('tasks')
  const TABS = ALL_TABS
  const [workoutFocus, setWorkoutFocus] = useState(null) // event_id to filter Workout tab to
  const [workoutNav, setWorkoutNav] = useState(null)     // {ex, nonce} — open this exercise on Workout tab
  const [modal, setModal] = useState(null)

  // Launched from the widget's deep link → reopen the last workout spot
  // (breadcrumb written by FocusedChecklistSheet to localStorage).
  const widgetHandled = useRef(false)
  const [widgetNonce, setWidgetNonce] = useState(0)
  // Bundled app: the shell calls __hhOpenWorkout() (from the widget deep link)
  // after load, since there's no ?widget= query string to read.
  useEffect(() => {
    window.__hhOpenWorkout = () => { window.__hhWidgetWorkout = true; setWidgetNonce((n) => n + 1) }
    return () => { delete window.__hhOpenWorkout }
  }, [])
  useEffect(() => {
    if (widgetHandled.current || !isWidgetWorkoutLaunch() || !events.length) return
    try {
      const spot = JSON.parse(localStorage.getItem('hh_active_spot') || 'null')
      const ev = spot?.eventId && events.find((e) => e.id === spot.eventId)
      if (ev) {
        widgetHandled.current = true
        if (spot.logDate) setSelected(new Date(spot.logDate + 'T12:00'))
        setTab('workout')
        setModal({ checklist: ev })
      }
    } catch { /* ignore */ }
  }, [events, widgetNonce])

  return (
    <div className="ph">
      {!isConfigured && <div className="banner">⚠ Supabase not configured</div>}

      <div className="tab-content">
        {tab === 'tasks' && (
          <TasksTab
            events={events} statuses={statuses} streak={streak} user={user}
            displayName={displayName} eventsLoading={eventsLoading}
            selected={selected} setSelected={setSelected}
            weekBase={weekBase} setWeekBase={setWeekBase}
            filter={filter} setFilter={setFilter}
            openChecklist={(e) => setModal({ checklist: e })}
            openGymPicker={(day) => setModal({ gymPicker: day })}
            switchUser={() => setModal({ profile: true })}
          />
        )}
        {tab === 'calendar' && (
          <CalendarTab events={events} selected={selected} setSelected={setSelected}
            switchToTasks={() => setTab('tasks')} />
        )}
        {tab === 'workout' && (
          <WorkoutTab events={events} user={user}
            focusedEventId={workoutFocus}
            clearFocus={() => setWorkoutFocus(null)}
            navReq={workoutNav}
            openChecklist={(e) => setModal({ checklist: e })}
            switchToTasks={() => setTab('tasks')} />
        )}
        {tab === 'calories' && <CaloriesTab events={events} user={user} />}
        {tab === 'oura' && <OuraTab user={user} />}
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

      {modal?.checklist && modal.checklist.type === 'gym' && (
        <FocusedChecklistSheet event={modal.checklist} day={new Date(selected)} user={user}
          events={events}
          onClose={() => setModal(null)}
          openGymPicker={() => setModal({ gymPicker: new Date(selected) })}
          onBuildCustom={() => setModal({ custom: ymd(new Date(selected)) })} />
      )}
      {modal?.checklist && modal.checklist.type !== 'gym' && (
        <ChecklistSheet event={modal.checklist} day={new Date(selected)} user={user}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ event: modal.checklist })}
          onOpenExercise={(ex) => {
            setWorkoutNav({ ex, nonce: Date.now() })
            setTab('workout')
            setModal(null)
          }}
          onBuildCustom={() => setModal({ custom: ymd(new Date(selected)) })} />
      )}
      {modal?.gymPicker && (
        <RoutinePicker day={new Date(modal.gymPicker)} user={user}
          onClose={() => setModal(null)}
          onBuildCustom={() => setModal({ custom: modal.gymPicker })} />
      )}
      {modal?.custom && (
        <CustomWorkoutBuilder day={new Date(modal.custom)} user={user}
          onClose={() => setModal(null)} />
      )}
      {(modal?.new || modal?.event) && (
        <EventModal event={modal.event} events={events} defaultDate={new Date(selected)}
          user={user} onClose={() => setModal(null)} />
      )}
      {modal?.profile && <ProfileSheet onClose={() => setModal(null)} />}
    </div>
  )
}
