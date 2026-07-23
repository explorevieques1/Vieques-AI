import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signIn } from '../lib/supabase.js'
import { fetchEntitlement } from '../lib/api.js'
import { mapUrlWithSession } from '../lib/mapApp.js'

export default function LogIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }

    setStatus('submitting')

    // Validates the user against Supabase Auth. On success Supabase
    // returns a session (JWT); the client stores it automatically.
    const { data, error: signInError } = await signIn(email, password)

    if (signInError) {
      setStatus('error')
      // Supabase returns "Invalid login credentials" for wrong email/pw,
      // and a distinct message if the email isn't confirmed yet.
      setError(signInError.message)
      return
    }

    if (data?.session) {
      // Logged in — now ask the backend whether they've PAID.
      // Paid users go straight to the map; everyone else to pricing.
      const ent = await fetchEntitlement(data.session)
      if (ent.hasAccess) {
        // Hand the session off in the URL so the map app (different origin)
        // adopts it — otherwise it can't see we're logged in and loops back.
        window.location.href = mapUrlWithSession(data.session)
      } else {
        navigate('/pricing')
      }
    } else {
      // No session but no error usually means email not confirmed.
      setStatus('error')
      setError('Please confirm your email before logging in.')
    }
  }

  return (
    <main style={styles.wrap}>
      {/* subtle background glow, echoing the Home hero */}
      <div style={styles.glow} aria-hidden="true" />

      <div style={styles.card}>
        <Link to="/" style={styles.brand}>
          Explore<span style={{ color: '#06b6d4' }}> Vieques</span>
        </Link>

        <h1 style={styles.h1}>Welcome back</h1>
        <p style={styles.sub}>Log in to pick up where you left off.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.btn} disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p style={styles.foot}>
          Don't have an account? <Link to="/signup" style={styles.link}>Sign up</Link>
        </p>
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
  sub: { color: '#94a3b8', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 },
  form: { display: 'grid', gap: 16 },
  label: { display: 'grid', gap: 6, color: '#cbd5e1', fontSize: 13, fontWeight: 600 },
  input: {
    padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,.2)',
    background: '#0b1120', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  btn: {
    marginTop: 4, padding: '12px 20px', borderRadius: 10, border: 'none',
    background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14,
    cursor: 'pointer', textAlign: 'center',
  },
  error: { color: '#fca5a5', fontSize: 13, margin: 0 },
  foot: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  link: { color: '#67e8f9', fontWeight: 600 },
}