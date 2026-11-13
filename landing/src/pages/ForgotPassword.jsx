import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../lib/supabase.js'

/**
 * Asks for an email and sends the recovery link.
 *
 * The success copy deliberately does not say whether the address had an
 * account. Confirming that would turn this form into a way to test which
 * emails are registered, and it is the one page anyone can submit unauthenticated.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | sent | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Enter the email you signed up with.')
      return
    }

    setStatus('submitting')

    // Must match an entry on the Supabase redirect allowlist, otherwise the
    // link silently falls back to Site URL and lands nowhere useful.
    const redirectTo = new URL('/reset-password', window.location.origin).toString()
    const { error: resetError } = await requestPasswordReset(email, redirectTo)

    // A missing account is not an error worth surfacing — see the note above.
    // Only real failures (rate limit, transport) get shown.
    if (resetError) {
      setStatus('error')
      setError(resetError.message)
      return
    }

    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <main style={styles.wrap}>
        <div style={styles.glow} aria-hidden="true" />
        <div style={styles.card}>
          <Link to="/" style={styles.brand}>
            Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
          </Link>
          <h1 style={styles.h1}>Check your email</h1>
          <p style={styles.sub}>
            If an account exists for <strong style={{ color: 'var(--text)' }}>{email}</strong>,
            we've sent a link to reset your password.
          </p>
          <p style={styles.sub}>
            Nothing yet? Check your spam folder. The link expires in 24 hours.
          </p>
          <Link to="/login" style={styles.btn}>Back to log in</Link>
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

        <h1 style={styles.h1}>Forgot your password?</h1>
        <p style={styles.sub}>
          Enter your email and we'll send you a link to set a new one.
        </p>

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
              autoFocus
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.btn} disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <p style={styles.foot}>
          Remembered it? <Link to="/login" style={styles.link}>Log in</Link>
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
  error: { color: '#fca5a5', fontSize: 13, margin: 0 },
  foot: { color: 'var(--muted)', fontSize: 13, textAlign: 'center', marginTop: 20 },
  link: { color: 'var(--sea)', fontWeight: 600 },
}
