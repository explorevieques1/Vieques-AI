import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, updatePassword } from '../lib/supabase.js'

/**
 * Where the recovery email lands. Supabase puts the tokens in the URL hash and
 * the client exchanges them for a short-lived session; updateUser() then acts
 * on whoever that session belongs to.
 *
 * The session arrives asynchronously, so we wait for the PASSWORD_RECOVERY
 * event rather than reading getSession() on first render — checking too early
 * looks identical to an expired link.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)   // recovery session established
  const [dead, setDead] = useState('')        // link expired / already used
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | done
  const [error, setError] = useState('')

  useEffect(() => {
    let settled = false

    const hash = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hash.get('error_description') || hash.get('error')
    if (hashError) {
      setDead(hashError.replace(/\+/g, ' '))
      return
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !settled) {
        settled = true
        setReady(true)
      }
    })

    // In case the exchange completed before the listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session && !settled) {
        settled = true
        setReady(true)
      }
    })

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        setDead('This reset link has expired or was already used.')
      }
    }, 5000)

    return () => {
      sub?.subscription?.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.')
      return
    }

    setStatus('submitting')
    const { error: updateError } = await updatePassword(password)

    if (updateError) {
      setStatus('idle')
      // Supabase rejects a password found in a breach corpus when leaked
      // password protection is on — its message is already user-facing.
      setError(updateError.message)
      return
    }

    setStatus('done')

    // The recovery session is still live, so they are signed in. Sign out and
    // send them to log in with the new password: it confirms the change took,
    // and it keeps a shared or forwarded email from leaving a live session behind.
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login?reset=1', { replace: true }), 1200)
  }

  if (dead) {
    return (
      <main style={styles.wrap}>
        <div style={styles.glow} aria-hidden="true" />
        <div style={styles.card}>
          <Link to="/" style={styles.brand}>
            Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
          </Link>
          <h1 style={styles.h1}>This link didn't work</h1>
          <p style={styles.sub}>{dead}</p>
          <p style={styles.sub}>Request a new one and we'll email it right over.</p>
          <Link to="/forgot-password" style={styles.btn}>Send a new link</Link>
        </div>
      </main>
    )
  }

  if (status === 'done') {
    return (
      <main style={styles.wrap}>
        <div style={styles.glow} aria-hidden="true" />
        <div style={styles.card}>
          <Link to="/" style={styles.brand}>
            Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
          </Link>
          <h1 style={styles.h1}>Password updated ✓</h1>
          <p style={styles.sub}>Taking you to log in…</p>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.card}>
        <Link to="/" style={styles.brand}>
          Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
        </Link>

        <h1 style={styles.h1}>Set a new password</h1>
        <p style={styles.sub}>
          {ready ? 'Choose something you haven’t used elsewhere.' : 'Checking your link…'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            New password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={!ready}
              required
            />
          </label>

          <label style={styles.label}>
            Confirm password
            <input
              style={styles.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              autoComplete="new-password"
              disabled={!ready}
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            style={{ ...styles.btn, ...(ready ? null : styles.btnDisabled) }}
            disabled={!ready || status === 'submitting'}
          >
            {status === 'submitting' ? 'Saving…' : 'Update password'}
          </button>
        </form>

        <p style={styles.foot}>
          <Link to="/login" style={styles.link}>Back to log in</Link>
        </p>
      </div>
    </main>
  )
}

const styles = {
  wrap: {
    position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center',
    background: 'var(--pearl)', padding: 24, fontFamily: 'var(--font)',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    background:
      'radial-gradient(700px 400px at 70% -10%, rgba(100,219,232,.13), transparent 60%),' +
      'radial-gradient(600px 400px at 10% 110%, rgba(43,169,184,.12), transparent 60%)',
  },
  card: {
    position: 'relative', width: '100%', maxWidth: 400, background: 'var(--pearl-2)',
    border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 32,
    boxShadow: '0 30px 80px rgba(0,0,0,.4)',
  },
  brand: {
    fontFamily: 'var(--font)', fontWeight: 700, fontSize: 18,
    color: 'var(--text)', textDecoration: 'none', display: 'inline-block', marginBottom: 24,
  },
  h1: { fontFamily: 'var(--font)', color: 'var(--text)', fontSize: 26, margin: '0 0 8px' },
  sub: { color: 'var(--muted)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 },
  form: { display: 'grid', gap: 16, marginTop: 8 },
  label: { display: 'grid', gap: 6, color: 'var(--text)', fontSize: 13, fontWeight: 600 },
  input: {
    padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,.2)',
    background: 'var(--pearl)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  btn: {
    marginTop: 4, padding: '12px 20px', borderRadius: 999, border: 'none',
    background: 'var(--flush)', color: '#FFFFFF', fontWeight: 700, fontSize: 15,
    cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block',
    fontFamily: 'inherit',
  },
  btnDisabled: { opacity: 0.5, cursor: 'default' },
  error: { color: '#fca5a5', fontSize: 13, margin: 0 },
  foot: { color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 },
  link: { color: 'var(--sea)', fontWeight: 600 },
}
