import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Supabase env vars missing — check frontend/.env')
}

// Same Supabase project as the landing app, but a DIFFERENT origin — so the
// landing session is NOT in this origin's localStorage. The landing site hands
// the tokens off in the URL hash and AccessGate adopts them via setSession().
// detectSessionInUrl is off so the client doesn't try to parse that hash itself
// (it expects the OAuth format); we handle it explicitly instead.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export const getSession = () => supabase.auth.getSession()