import { useEffect, useState, type ReactNode } from 'react'
import { getSession, supabase } from '../lib/supabase'

// Where the marketing/landing site lives (login + pricing).
// Set VITE_LANDING_URL in frontend/.env (e.g. https://explorevieques.org).
const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'http://localhost:5174'

function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3001`
  }
  return 'http://localhost:3001'
}
const API_BASE = resolveApiBase()

type GateState = 'checking' | 'allowed' | 'denied'

// Wrap the entire map app. Nobody sees the map until we've confirmed, against
// the backend, that this signed-in user has an active plan. Unpaid or
// unauthenticated users are bounced to the landing site.
export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    let cancelled = false

    // The landing site hands the session off in the URL hash (localStorage is
    // per-origin, so it can't be read directly). Adopt those tokens, then strip
    // them from the URL so they don't linger in history.
    async function adoptSessionFromUrl() {
      const hash = window.location.hash
      if (hash.length < 2) return
      const params = new URLSearchParams(hash.slice(1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token })
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    async function check() {
      await adoptSessionFromUrl()

      const { data } = await getSession()
      const token = data?.session?.access_token

      // Not logged in at all -> send to login on the landing site.
      if (!token) {
        redirect(`${LANDING_URL}/login`)
        return
      }

      // Logged in -> ask the backend if they've actually paid.
      try {
        const res = await fetch(`${API_BASE}/api/entitlement`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const ent = res.ok ? await res.json() : { hasAccess: false }
        if (cancelled) return

        if (ent.hasAccess) {
          setState('allowed')
        } else {
          setState('denied')
          redirect(`${LANDING_URL}/pricing`)
        }
      } catch {
        if (cancelled) return
        // On a network error, fail closed (deny) rather than leak access.
        setState('denied')
        redirect(`${LANDING_URL}/pricing`)
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  if (state === 'checking') {
    return (
      <div className="h-screen w-screen grid place-items-center bg-slate-900 text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-slate-700 border-t-cyan-400 animate-spin" />
          <p>Checking your access…</p>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    // The redirect is already firing; show a brief message meanwhile.
    return (
      <div className="h-screen w-screen grid place-items-center bg-slate-900 text-slate-300">
        <p>Redirecting…</p>
      </div>
    )
  }

  return <>{children}</>
}

function redirect(url: string) {
  // Small delay-free hard redirect out to the landing site.
  window.location.href = url
}