import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isConfigured } from '../supabaseClient.js'
import { occursOn } from './date.js'
import { parseEvent, completion } from './checklist.js'

// Shared realtime data layer for both the phone and TV views.

export function useEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured) { setLoading(false); return }
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })
    setEvents(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`events-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reload)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [reload])

  return { events, loading, reload }
}

export function useClaudeStatus() {
  const [statuses, setStatuses] = useState([])
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const { data } = await supabase.from('claude_status').select('*')
    setStatuses(data || [])
  }, [])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`claude-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claude_status' }, reload)
      .subscribe()
    // Periodic re-render so "Xm ago" stays fresh and stale "working" decays.
    const t = setInterval(reload, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [reload])

  return { statuses }
}

// Per-occurrence progress for a given local date (YYYY-MM-DD).
// Returns byEvent[event_id][item_key] = row, plus a realtime subscription.
let _chSeq = 0
export function useProgress(logDate) {
  const [byEvent, setByEvent] = useState({})
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured || !logDate) return
    const { data } = await supabase
      .from('progress').select('*').eq('log_date', logDate)
    const m = {}
    for (const r of data || []) {
      ;(m[r.event_id] ||= {})[r.item_key] = r
    }
    setByEvent(m)
  }, [logDate])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`progress-${logDate}-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progress' }, reload)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [reload, logDate])

  return { byEvent, reload }
}

// Consecutive days ending today on which EVERY scheduled event was fully
// completed (all items / all gym sets). Today gets a grace until end-of-day
// (today being incomplete doesn't break the streak — yesterday determines it).
// A day with no scheduled events is treated as a break.
export function useStreak(events) {
  const [streak, setStreak] = useState(0)
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const since = new Date(); since.setDate(since.getDate() - 120)
    const sinceKey = since.toISOString().slice(0, 10)
    const { data } = await supabase
      .from('progress').select('*').gte('log_date', sinceKey)

    // Bucket: byDate[ymd][event_id][item_key] = row
    const byDate = {}
    for (const r of data || []) {
      ((byDate[r.log_date] ||= {})[r.event_id] ||= {})[r.item_key] = r
    }
    const pad = (n) => String(n).padStart(2, '0')
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    const dayQualifies = (d) => {
      const todays = (events || []).filter((e) => occursOn(e, d))
      if (todays.length === 0) return false
      const pd = byDate[key(d)] || {}
      return todays.every((e) => {
        const parsed = parseEvent(e)
        const { done, total } = completion(parsed, pd[e.id] || {})
        return total > 0 && done === total
      })
    }

    let d = new Date()
    if (!dayQualifies(d)) d.setDate(d.getDate() - 1) // grace for today
    let n = 0
    while (dayQualifies(d) && n < 400) { n++; d.setDate(d.getDate() - 1) }
    setStreak(n)
  }, [events])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`streak-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progress' }, reload)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [reload])

  // Reflect streak as the OS-level app-icon badge (iOS 16.4+, desktop PWAs).
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (streak > 0) navigator.setAppBadge(streak).catch(() => {})
    else navigator.clearAppBadge?.().catch(() => {})
  }, [streak])

  return streak
}

// Last N days of Oura snapshots from health_daily (server-synced hourly).
export function useHealth(days = 14) {
  const [rows, setRows] = useState([])
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const { data } = await supabase
      .from('health_daily').select('*')
      .order('day', { ascending: false }).limit(days)
    setRows(data || [])
  }, [days])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`health-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'health_daily' }, reload)
      .subscribe()
    // Also refresh every 5 minutes (cron runs hourly but UI feels live).
    const t = setInterval(reload, 5 * 60 * 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [reload])

  return rows
}

// Ordered roadmap milestones.
export function useMilestones() {
  const [rows, setRows] = useState([])
  const chanId = useRef(++_chSeq)

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const { data } = await supabase
      .from('milestones').select('*').order('position', { ascending: true })
    setRows(data || [])
  }, [])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel(`milestones-${chanId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, reload)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [reload])

  return rows
}

export async function saveProgress(eventId, logDate, itemKey, patch) {
  if (!isConfigured) return
  return supabase.from('progress').upsert(
    { event_id: eventId, log_date: logDate, item_key: itemKey, updated_at: new Date().toISOString(), ...patch },
    { onConflict: 'event_id,log_date,item_key' }
  )
}

export async function saveEvent(ev) {
  if (!isConfigured) return { error: 'not configured' }
  if (ev.id) {
    const { id, ...rest } = ev
    return supabase.from('events').update(rest).eq('id', id)
  }
  return supabase.from('events').insert(ev)
}

export async function deleteEvent(id) {
  if (!isConfigured) return
  return supabase.from('events').delete().eq('id', id)
}
