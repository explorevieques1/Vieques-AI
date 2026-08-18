import { getSession } from './supabase.js'
import { fetchEntitlement } from './api.js'

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
//
// Checks for a paid pass FIRST. The map is paid-only (no free tier), so a
// signed-in account with no purchase is sent to pricing instead of into the
// app. Without this, "Launch App" hands off a session, the map app boots, and
// its AccessGate bounces the user back here — a visible round-trip through a
// loading spinner to reach the page they should have gone to directly.
//
// This is convenience, not enforcement. Every landing "Launch" button routes
// through here, so they all inherit the check, but the real boundaries are the
// map app's AccessGate and the server-side requireTier gates — neither of which
// trusts anything this function decides.
//
// `skipEntitlementCheck` is for the post-checkout page ONLY, where Stripe has
// confirmed payment but the webhook may not have written the subscription row
// yet. Such a user genuinely paid and would otherwise be bounced to pricing by
// a check that is merely out of date. Nothing is granted by skipping — the map
// app's own gate still runs; this only declines to block on stale data.
export async function launchMapApp({ skipEntitlementCheck = false } = {}) {
  const { data } = await getSession()
  const session = data?.session
  if (!session?.access_token) {
    window.location.href = '/login'
    return
  }

  if (!skipEntitlementCheck) {
    // `ok` separates "we asked, they hold nothing" from "we could not ask".
    // Only the first is grounds for blocking. On a failed call fall through to
    // the map app, whose gate re-checks and redirects if this really is a
    // non-payer — stranding a paying customer on the pricing page over a
    // network blip is the worse error.
    const ent = await fetchEntitlement(session)
    if (ent.ok && !ent.hasAccess) {
      window.location.href = '/pricing'
      return
    }
  }

  window.location.href = mapUrlWithSession(session)
}
