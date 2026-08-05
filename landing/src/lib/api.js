const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

// Attach the Supabase JWT so the backend can identify the user.
function authHeaders(session) {
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export async function startCheckout(plan, session) {
  const res = await fetch(`${API_BASE}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
    body: JSON.stringify({
      plan,
      userId: session?.user?.id || null,
      email: session?.user?.email || null,
    }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Checkout failed')
  const { url } = await res.json()
  if (url) window.location.href = url
}

// Join the business waitlist. Unlike every other call in this file this one
// sends no auth header — business owners land on the pricing page without an
// account, and requiring signup first would cost most of the signups. The
// backend rate-limits it by IP.
export async function joinBusinessWaitlist(fields) {
  const res = await fetch(`${API_BASE}/api/business-waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error || 'Could not save your details.')
  }
  return res.json()
}

// Ask the backend whether this user has active access / credits.
// Returns { hasAccess: boolean, tier, plans: [...], credits: number } or a
// safe default if the call fails, so callers never crash on network hiccups.
//
// The fallback carries `ok: false` so a caller can tell "we asked and they hold
// nothing" apart from "we could not reach the API". Those look identical in the
// payload but must not look identical on screen: telling a paying customer they
// have no plan because their wifi dropped is the same failure as the hardcoded
// placeholder this replaced.
export async function fetchEntitlement(session) {
  const fallback = { ok: false, hasAccess: false, plans: [], credits: 0 }
  try {
    const res = await fetch(`${API_BASE}/api/entitlement`, {
      headers: authHeaders(session),
    })
    if (!res.ok) return fallback
    return { ok: true, ...(await res.json()) }
  } catch {
    return fallback
  }
}