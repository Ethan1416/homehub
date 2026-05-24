// Clean stroke icons (Instagram-style). Filled variant when active.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconTasks({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...S}
      fill={active ? 'currentColor' : 'none'}>
      <rect x="5" y="4" width="14" height="17" rx="3"
        fill={active ? 'currentColor' : 'none'} />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z"
        fill={active ? '#fff' : 'none'} stroke={active ? '#fff' : 'currentColor'} />
      <path d="M9 12.5l2 2 4-4"
        stroke={active ? '#fff' : 'currentColor'} fill="none" />
    </svg>
  )
}

export function IconCalendar({ active }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...S}
      fill={active ? 'currentColor' : 'none'}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3"
        fill={active ? 'currentColor' : 'none'} />
      <path d="M3.5 10h17"
        stroke={active ? '#fff' : 'currentColor'} />
      <path d="M8 3.5v3M16 3.5v3"
        stroke={active ? '#fff' : 'currentColor'} />
      {active && (
        <>
          <circle cx="8.5" cy="14" r="1.1" fill="#fff" stroke="none" />
          <circle cx="12" cy="14" r="1.1" fill="#fff" stroke="none" />
          <circle cx="15.5" cy="14" r="1.1" fill="#fff" stroke="none" />
        </>
      )}
    </svg>
  )
}

export function IconWorkout({ active }) {
  // dumbbell glyph
  return (
    <svg width="28" height="26" viewBox="0 0 28 24" {...S}
      strokeWidth={active ? 2.2 : 1.8}>
      <rect x="2" y="9" width="3.5" height="6" rx="1"
        fill={active ? 'currentColor' : 'none'} />
      <rect x="22.5" y="9" width="3.5" height="6" rx="1"
        fill={active ? 'currentColor' : 'none'} />
      <rect x="5.5" y="7" width="3" height="10" rx="1"
        fill={active ? 'currentColor' : 'none'} />
      <rect x="19.5" y="7" width="3" height="10" rx="1"
        fill={active ? 'currentColor' : 'none'} />
      <line x1="8.5" y1="12" x2="19.5" y2="12" />
    </svg>
  )
}

export function IconClaude({ active }) {
  // Code brackets — represents Claude Code activity
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" {...S}
      strokeWidth={active ? 2.2 : 1.8}>
      <rect x="3" y="4" width="18" height="16" rx="3"
        fill={active ? 'currentColor' : 'none'} />
      <path d="M9.5 9.5l-2.5 2.5 2.5 2.5"
        stroke={active ? '#fff' : 'currentColor'} fill="none" />
      <path d="M14.5 9.5l2.5 2.5-2.5 2.5"
        stroke={active ? '#fff' : 'currentColor'} fill="none" />
    </svg>
  )
}

export function IconOura({ active }) {
  // pulse/heartbeat line — feels more "vitals" than a ring emoji
  return (
    <svg width="28" height="26" viewBox="0 0 26 24" {...S}
      strokeWidth={active ? 2.2 : 1.8}>
      <path d="M2 13h4l2-5 3 10 3-7 2 4 3-2h5"
        stroke="currentColor" fill="none" />
    </svg>
  )
}
