import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { launchMapApp } from '../lib/mapApp.js'
import { PLAN_LABELS } from '../lib/plans.js'
import { trackPurchase } from '../lib/ads.js'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

// What Stripe actually charged for THIS checkout, once the webhook has
// fulfilled it. null = not fulfilled yet (404) or not reachable.
async function fetchReceipt(sessionId) {
  const { data } = await getSession()
  const token = data?.session?.access_token
  if (!token) return null
  const res = await fetch(`${API_BASE}/api/checkout/receipt?session_id=${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok ? res.json() : null
}

// Ask the backend whether THIS user actually has access. This is the
// source of truth — the webhook wrote it after Stripe confirmed payment.
async function fetchEntitlement() {
  const { data } = await getSession()
  const token = data?.session?.access_token
  if (!token) return null
  const res = await fetch(`${API_BASE}/api/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export default function Success() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session_id')

  // 'checking' | 'active' | 'pending' | 'error'
  const [state, setState] = useState('checking')
  const [plan, setPlan] = useState(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    // The webhook can lag a second or two behind the redirect, so poll
    // a few times before giving up rather than flashing an error.
    async function check() {
      const ent = await fetchEntitlement()
      if (cancelled) return

      if (ent?.hasAccess) {
        setPlan(ent.plans?.[0]?.plan || null)
        setState('active')
        return
      }
      if (attempts++ < 5) {
        setTimeout(check, 1500) // retry: give the webhook time to land
      } else {
        setState('pending') // paid, but not yet reflected — not an error
      }
    }

    if (!sessionId) { setState('error'); return }
    check()
    return () => { cancelled = true }
  }, [sessionId])

  // Report the sale to Google Ads — only for a checkout the webhook has
  // fulfilled, with the real amount. Independent of the entitlement poll above:
  // someone who already holds a pass and buys a message pack reads as "active"
  // before this purchase's webhook lands. `reported` gates the auto-redirect
  // below so the page doesn't unload mid-send; the 6s cap means a slow webhook
  // or an ad blocker can delay the buyer, never strand them.
  const [reported, setReported] = useState(false)
  useEffect(() => {
    if (!sessionId) { setReported(true); return }
    let cancelled = false
    let attempts = 0
    const cap = setTimeout(() => setReported(true), 6000)
    async function report() {
      const receipt = await fetchReceipt(sessionId).catch(() => null)
      if (cancelled) return
      if (receipt) {
        await trackPurchase({ transactionId: receipt.sessionId, valueCents: receipt.amountTotal })
        if (!cancelled) setReported(true)
        return
      }
      if (attempts++ < 3) setTimeout(report, 1500)
      else setReported(true)
    }
    report()
    return () => { cancelled = true; clearTimeout(cap) }
  }, [sessionId])

  // Once the webhook has landed and access is real, hand off to the map without
  // making the user click. The short pause is deliberate: it lets them see WHICH
  // plan activated before the page navigates away. The button below stays as a
  // manual fallback for anyone whose browser blocks the programmatic redirect.
  useEffect(() => {
    if (state !== 'active' || !reported) return
    const timer = setTimeout(() => { void launchMapApp() }, 1800)
    return () => clearTimeout(timer)
  }, [state, reported])

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.card}>
        {state === 'checking' && (
          <>
            <div style={styles.spinner} aria-hidden="true" />
            <h1 style={styles.h1}>Confirming your payment…</h1>
            <p style={styles.sub}>One moment while we activate your access.</p>
          </>
        )}

        {state === 'active' && (
          <>
            <div style={styles.check}>✓</div>
            <h1 style={styles.h1}>You're all set!</h1>
            <p style={styles.sub}>
              {plan && PLAN_LABELS[plan]
                ? `Your ${PLAN_LABELS[plan]} is active. Taking you to the map…`
                : 'Payment confirmed. Taking you to the map…'}
            </p>
            <div style={styles.actions}>
              <button onClick={() => { void launchMapApp() }} style={styles.btnPrimary}>Launch App →</button>
              <Link to="/" style={styles.btnGhost}>Return Home</Link>
            </div>
          </>
        )}

        {state === 'pending' && (
          <>
            <div style={styles.check}>⏳</div>
            <h1 style={styles.h1}>Payment received</h1>
            <p style={styles.sub}>
              We're finalizing your access — this can take a moment. You can
              launch the app now, or refresh this page shortly.
            </p>
            <div style={styles.actions}>
              {/* Payment is confirmed by Stripe; only the webhook is late. Skip
                  the entitlement check so a real customer is not sent back to
                  pricing by a subscriptions row that has not landed yet. */}
              <button onClick={() => { void launchMapApp({ skipEntitlementCheck: true }) }} style={styles.btnPrimary}>Launch App →</button>
              <button onClick={() => window.location.reload()} style={styles.btnGhost}>Refresh</button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ ...styles.check, color: '#f87171', borderColor: '#f87171', background: 'rgba(248,113,113,.12)' }}>!</div>
            <h1 style={styles.h1}>Something's off</h1>
            <p style={styles.sub}>
              We couldn't confirm a checkout session. If you were charged,
              please contact support and we'll sort it out.
            </p>
            <div style={styles.actions}>
              <button onClick={() => navigate('/pricing')} style={styles.btnPrimary}>Back to Pricing</button>
              <Link to="/" style={styles.btnGhost}>Return Home</Link>
            </div>
          </>
        )}

        {sessionId && state !== 'error' && (
          <p style={styles.meta}>Session: {sessionId.slice(0, 20)}…</p>
        )}
      </div>
    </main>
  )
}

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--pearl)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(700px 400px at 50% -10%, rgba(100,219,232,.16), transparent 60%)' },
  card: { position: 'relative', width: '100%', maxWidth: 440, textAlign: 'center', background: 'var(--pearl-2)', border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 40, boxShadow: '0 30px 80px rgba(0,0,0,.4)' },
  check: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(100,219,232,.15)', border: '2px solid var(--sea)', color: 'var(--sea)', fontSize: 28, display: 'grid', placeItems: 'center', margin: '0 auto 20px' },
  spinner: { width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(148,163,184,.2)', borderTopColor: 'var(--sea)', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
  h1: { fontFamily: 'var(--font)', color: 'var(--text)', fontSize: 28, margin: '0 0 10px' },
  sub: { color: 'var(--muted)', fontSize: 15, lineHeight: 1.5, margin: '0 0 28px' },
  actions: { display: 'grid', gap: 12 },
  btnPrimary: { padding: '14px 20px', borderRadius: 999, background: 'var(--flush)', color: '#FFFFFF', fontWeight: 700, fontSize: 16, textDecoration: 'none', border: 'none', cursor: 'pointer' },
  btnGhost: { padding: '13px 20px', borderRadius: 10, background: 'transparent', color: 'var(--text)', border: '1px solid rgba(148,163,184,.2)', fontWeight: 600, fontSize: 14, textDecoration: 'none', cursor: 'pointer' },
  meta: { marginTop: 20, color: 'var(--faint)', fontSize: 11, fontFamily: 'monospace' },
}