import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { signUp } from '../lib/supabase.js'

export default function SignUp() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = params.get('plan') // set when they clicked a pricing button

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setStatus('submitting')

    // Supabase Auth creates the auth.users row; the DB trigger then
    // creates the matching profiles row automatically. We pass full_name
    // in metadata so the trigger can populate it.
    const { data, error: signUpError } = await signUp(email, password, {
      data: { full_name: name },
    })

    if (signUpError) {
      setStatus('error')
      setError(signUpError.message)
      return
    }

    setStatus('done')

    // If email confirmation is ON in Supabase, there's no session yet —
    // the user must verify first. If it's OFF, they're logged in immediately.
    const hasSession = Boolean(data?.session)
    if (hasSession) {
      // logged in already → continue to pricing (carry the chosen plan)
      navigate(plan ? `/pricing?plan=${encodeURIComponent(plan)}` : '/pricing')
    }
    // if no session, we show the "check your email" message below
  }

  // success state — account created
  if (status === 'done') {
    return (
      <main style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Account created ✓</h1>
          <p style={styles.sub}>
            Check your email to confirm your account, then log in to continue.
          </p>
          <Link to="/login" style={styles.btn}>Go to log in</Link>
        </div>
      </main>
    )
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Create your account</h1>
        <p style={styles.sub}>
          {plan
            ? `You picked the ${plan.replace('_', ' ')} plan — create an account to continue.`
            : 'Start exploring Vieques with your AI island guide.'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Name
            <input
              style={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>

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
              placeholder="At least 6 characters"
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.btn} disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.foot}>
          Already have an account? <Link to="/login" style={styles.link}>Log in</Link>
        </p>
      </div>
    </main>
  )
}

const styles = {
  wrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif' },
  card: { width: '100%', maxWidth: 400, background: '#111c33', border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 32 },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 26, margin: '0 0 8px' },
  sub: { color: '#94a3b8', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 },
  form: { display: 'grid', gap: 16 },
  label: { display: 'grid', gap: 6, color: '#cbd5e1', fontSize: 13, fontWeight: 600 },
  input: { padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,.2)', background: '#0b1120', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
  btn: { marginTop: 4, padding: '12px 20px', borderRadius: 10, border: 'none', background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'block' },
  error: { color: '#fca5a5', fontSize: 13, margin: 0 },
  foot: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  link: { color: '#67e8f9', fontWeight: 600 },
}