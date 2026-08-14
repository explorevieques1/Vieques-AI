import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { fetchEntitlement } from '../lib/api.js'
import { mapUrlWithSession } from '../lib/mapApp.js'

/**
 * Landing spot for every emailed auth link (confirm signup, magic link,
 * password recovery). Supabase puts the tokens in the URL and the JS client
 * exchanges them for a session on load — that exchange is async, so we wait
 * for onAuthStateChange rather than reading getSession() immediately.
 *
 * Confirming an email already logs the user in, so sending them to /login to
 * retype a password they entered a minute ago just loses signups. Instead we
 * forward exactly the way LogIn does: entitled users to the map, everyone else
 * to pricing. A dead link (expired, or already used) falls back to /login.
 */
export default function Welcome() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = params.get('plan') // survives the round-trip through the email
  const [error, setError] = useState('')

  useEffect(() => {
    let done = false

    // Supabase reports the error in the hash fragment, not the query string.
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hash.get('error_description') || hash.get('error')

    async function forward(session) {
      if (done) return
      done = true

      // Recovery links are for setting a new password, not for entering the
      // app — the session they carry only exists to authorize that change.
      const isRecovery =
        hash.get('type') === 'recovery' || params.get('type') === 'recovery'
      if (isRecovery) {
        navigate('/account?reset=1', { replace: true })
        return
      }

      const ent = await fetchEntitlement(session)
      if (ent.hasAccess) {
        window.location.href = mapUrlWithSession(session)
      } else {
        navigate(plan ? `/pricing?plan=${encodeURIComponent(plan)}` : '/pricing', {
          replace: true,
        })
      }
    }

    if (hashError) {
      setError(hashError.replace(/\+/g, ' '))
      return
    }

    // Fires once the client has parsed the URL and stored the session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) forward(session)
    })

    // Covers the case where the exchange finished before we subscribed.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) forward(data.session)
    })

    // No session after the client has had time to work means the link was
    // already used or has expired. Send them to log in the normal way.
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        navigate('/login?confirmed=stale', { replace: true })
      }
    }, 5000)

    return () => {
      sub?.subscription?.unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate, plan, params])

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.card}>
        <Link to="/" style={styles.brand}>
          Explore<span style={{ color: '#06b6d4' }}> Vieques</span>
        </Link>

        {error ? (
          <>
            <h1 style={styles.h1}>This link didn't work</h1>
            <p style={styles.sub}>{error}</p>
            <p style={styles.sub}>
              Confirmation links expire after 24 hours. Log in to have a new one
              sent.
            </p>
            <Link to="/login" style={styles.btn}>Go to log in</Link>
          </>
        ) : (
          <>
            <h1 style={styles.h1}>Confirming your email…</h1>
            <p style={styles.sub}>One moment — we're signing you in.</p>
          </>
        )}
      </div>
    </main>
  )
}

const styles = {
  wrap: {
    position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center',
    background: '#0f172a', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      'radial-gradient(700px 400px at 70% -10%, rgba(6,182,212,.13), transparent 60%),' +
      'radial-gradient(600px 400px at 10% 110%, rgba(14,116,144,.12), transparent 60%)',
  },
  card: {
    position: 'relative', width: '100%', maxWidth: 400, background: '#111c33',
    border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 32,
    boxShadow: '0 30px 80px rgba(0,0,0,.4)',
  },
  brand: {
    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18,
    color: '#e2e8f0', textDecoration: 'none', display: 'inline-block', marginBottom: 24,
  },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 26, margin: '0 0 8px' },
  sub: { color: '#94a3b8', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 },
  btn: {
    marginTop: 8, padding: '12px 20px', borderRadius: 10, border: 'none',
    background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block',
  },
}
