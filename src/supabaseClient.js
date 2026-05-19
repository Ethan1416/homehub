import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

// When unconfigured we still export a client-shaped stub so the UI can render
// a setup banner instead of crashing.
export const supabase = isConfigured
  ? createClient(url, key, { realtime: { params: { eventsPerSecond: 5 } } })
  : null
