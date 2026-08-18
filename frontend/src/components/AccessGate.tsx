import { useEffect, useState, type ReactNode } from 'react'
import { getSession, supabase } from '../lib/supabase'
import { fetchEntitlement, NO_ENTITLEMENT, LANDING_URL, type Entitlement } from '../lib/api'
import { EntitlementProvider } from '../lib/entitlement'

// ============================================================================
//  AccessGate — the boundary between "signed out" and "in the app"
// ============================================================================
//
//  This is a paywall again. The free tier is gone: an account is identity, not
//  access, and the map requires at minimum a Day Trip pass.
//
//     no session      → hard redirect to the landing login
//     no active pass  → hard redirect to the landing pricing page
//     holds a pass    → admitted, at whatever tier they bought
//
//  The per-feature gates downstream (requireTier / requireCredits server-side,
//  useFeature() in the UI) all stay. They now separate the PAID tiers from each
//  other rather than paid from free, and this door decides who gets in at all.
//
//  Two walls, deliberately. This one is UX — it puts a non-payer in front of
//  the buy button instead of an empty map. The server-side gates are the actual
//  security boundary: a hand-crafted request that skips the browser still hits
//  requireTier and still gets a 402.
// ============================================================================

type GateState = 'checking' | 'allowed'

export default function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')
  const [entitlement, setEntitlement] = useState<Entitlement>(NO_ENTITLEMENT)

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

        // The paywall. hasAccess is "holds at least one active paid pass" — the
        // exact question this door asks. Anything else (a brand-new account, an
        // expired Day Trip) goes to pricing rather than into an empty map.
        if (!ent.hasAccess) {
          redirect(`${LANDING_URL}/pricing`)
          return
        }
        setEntitlement(ent)
      } catch {
        if (cancelled) return
        // Could not reach the server. Do NOT redirect: a network blip is not
        // proof of non-payment, and bouncing a paying customer to a pricing
        // page they already bought from is the worse failure. Admit them with
        // an empty feature set — every gated route still refuses server-side,
        // so this grants nothing; it just keeps them in the app to retry.
        setEntitlement(NO_ENTITLEMENT)
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
