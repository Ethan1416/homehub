import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isConfigured } from '../supabaseClient.js'

// Shared realtime data layer for both the phone and TV views.

export function useEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

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
      .channel('events-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reload)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [reload])

  return { events, loading, reload }
}

export function useClaudeStatus() {
  const [statuses, setStatuses] = useState([])

  const reload = useCallback(async () => {
    if (!isConfigured) return
    const { data } = await supabase.from('claude_status').select('*')
    setStatuses(data || [])
  }, [])

  useEffect(() => {
    reload()
    if (!isConfigured) return
    const ch = supabase
      .channel('claude-rt')
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
