import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Supabase env vars missing — check landing/.env')
}

export const supabase = createClient(url, anonKey)

// --- auth helpers (thin wrappers; fill in as we build) ---
// options lets us pass { data: { full_name } } into auth metadata,
// which the DB trigger reads to populate profiles.full_name on signup.
export const signUp = (email, password, options) =>
  supabase.auth.signUp({ email, password, options })
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
export const signOut = () => supabase.auth.signOut()
export const getSession = () => supabase.auth.getSession()