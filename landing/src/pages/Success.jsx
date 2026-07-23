import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { launchMapApp } from '../lib/mapApp.js'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

const PLAN_LABELS = {
  traveler: 'Traveler Plan',
  credits: 'Credit Pack',
  business_basic: 'Basic Business',
  business_featured: 'Featured Business',
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
                ? `Your ${PLAN_LABELS[plan]} is active. Your island guide is ready.`
                : 'Payment confirmed. Your island guide is ready.'}
            </p>
            <div style={styles.actions}>
              <button onClick={launchMapApp} style={styles.btnPrimary}>Launch App →</button>
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
              <button onClick={launchMapApp} style={styles.btnPrimary}>Launch App →</button>
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
  wrap: { position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(700px 400px at 50% -10%, rgba(6,182,212,.16), transparent 60%)' },
  card: { position: 'relative', width: '100%', maxWidth: 440, textAlign: 'center', background: '#111c33', border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 40, boxShadow: '0 30px 80px rgba(0,0,0,.4)' },
  check: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(6,182,212,.15)', border: '2px solid #06b6d4', color: '#06b6d4', fontSize: 28, display: 'grid', placeItems: 'center', margin: '0 auto 20px' },
  spinner: { width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(148,163,184,.2)', borderTopColor: '#06b6d4', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 28, margin: '0 0 10px' },
  sub: { color: '#94a3b8', fontSize: 15, lineHeight: 1.5, margin: '0 0 28px' },
  actions: { display: 'grid', gap: 12 },
  btnPrimary: { padding: '14px 20px', borderRadius: 10, background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 15, textDecoration: 'none', border: 'none', cursor: 'pointer' },
  btnGhost: { padding: '13px 20px', borderRadius: 10, background: 'transparent', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.2)', fontWeight: 600, fontSize: 14, textDecoration: 'none', cursor: 'pointer' },
  meta: { marginTop: 20, color: '#64748b', fontSize: 11, fontFamily: 'monospace' },
}