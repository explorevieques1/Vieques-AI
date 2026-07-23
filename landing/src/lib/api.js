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

// Ask the backend whether this user has active access / credits.
// Returns { hasAccess: boolean, plans: [...], credits: number } or a
// safe default if the call fails, so callers never crash on network hiccups.
export async function fetchEntitlement(session) {
  try {
    const res = await fetch(`${API_BASE}/api/entitlement`, {
      headers: authHeaders(session),
    })
    if (!res.ok) return { hasAccess: false, plans: [], credits: 0 }
    return await res.json()
  } catch {
    return { hasAccess: false, plans: [], credits: 0 }
  }
}