import { getSession } from './supabase.js'

// Where the map app lives (a DIFFERENT origin from this landing site).
const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173'

// Build the map-app URL, handing off the Supabase session via the URL hash.
//
// Why: localStorage is per-origin, so the session created here (5174 /
// explorevieques.org) is NOT visible to the map app (5173 / app subdomain).
// Without this, the map app's AccessGate sees no session and bounces the user
// straight back to /login — an endless loop. We pass the tokens in the hash
// (never sent to any server); the map app adopts them and strips them.
export function mapUrlWithSession(session) {
  if (!session?.access_token || !session?.refresh_token) return APP_URL
  const params = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  return `${APP_URL}/#${params.toString()}`
}

// Read the current session, then hard-redirect into the map app with hand-off.
export async function launchMapApp() {
  const { data } = await getSession()
  window.location.href = mapUrlWithSession(data?.session)
}
