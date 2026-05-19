import { useEffect, useState, useCallback } from 'react'
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
