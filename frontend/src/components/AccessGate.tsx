import { useEffect, useState, type ReactNode } from 'react'
import { getSession, supabase } from '../lib/supabase'
import { fetchEntitlement, FREE_ENTITLEMENT, LANDING_URL, type Entitlement } from '../lib/api'
import { EntitlementProvider } from '../lib/entitlement'

// ============================================================================
//  AccessGate — the boundary between "signed out" and "in the app"
// ============================================================================
//
//  This used to be a paywall: no active subscription meant a bounce to the
//  landing pricing page. PRICING.md replaced that with a free tier, so the gate
//  now checks IDENTITY only:
//
//     no session      → hard redirect to the landing login (still a real gate)
//     signed in       → admitted, at whatever tier they hold (free included)
//
//  The paywall did not disappear, it moved. Instead of one wall at the door,
//  each feature checks its own tier — server-side in requireTier /
//  requireCredits, and in the UI via useFeature(). That is what makes the free
//  tier a funnel rather than a locked door: people can see what they'd be
//  buying. See PRICING.md §4.1.
// ============================================================================

type GateState = 'checking' | 'allowed'

export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')
  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT)

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

      // Not logged in at all -> send to login on the landing site. Still a hard
      // gate: everything downstream needs a user id to resolve a tier against.
      if (!token) {
        redirect(`${LANDING_URL}/login`)
        return
      }

      try {
        const ent = await fetchEntitlement()
        if (cancelled) return
        setEntitlement(ent)
      } catch {
        if (cancelled) return
        // Fail CLOSED, but not shut: admit them at the free tier rather than
        // granting paid features on a network blip. Worst case a paying user
        // briefly sees upsells; they never lose access to the app itself, and
        // the server would reject an over-reach anyway.
        setEntitlement(FREE_ENTITLEMENT)
      }
      if (!cancelled) setState('allowed')
    }

    check()
    return () => { cancelled = true }
  }, [])

  if (state === 'checking') {
    return (
      <div className="h-screen w-screen grid place-items-center bg-slate-900 text-slate-300">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-slate-700 border-t-cyan-400 animate-spin" />
          <p>Loading your island guide…</p>
        </div>
      </div>
    )
  }

  // Seed the provider with what we already fetched, so the app doesn't ask for
  // entitlement a second time on boot.
  return <EntitlementProvider initial={entitlement}>{children}</EntitlementProvider>
}

function redirect(url: string) {
  // Small delay-free hard redirect out to the landing site.
  window.location.href = url
}
