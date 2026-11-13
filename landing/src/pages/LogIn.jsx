import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { signIn } from '../lib/supabase.js'
import { fetchEntitlement } from '../lib/api.js'
import { mapUrlWithSession } from '../lib/mapApp.js'
import AuthLayout from '../components/AuthLayout.jsx'

export default function LogIn() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // /welcome sends them here when a confirmation link is expired or already
  // used. Without a note they'd just see a bare login form and wonder why.
  const staleLink = params.get('confirmed') === 'stale'
  // ResetPassword signs the user out and sends them here, so the new password
  // gets used once — confirmation that the change actually took.
  const justReset = params.get('reset') === '1'
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
    <AuthLayout pitch={PITCH} navAction={NAV_ACTION}>
      <h1>Welcome back</h1>
      <p className="auth-sub">Log in to pick up where you left off.</p>

      {justReset && <p className="form-note">Password updated. Log in with your new password.</p>}
      {staleLink && <p className="form-note">That confirmation link has expired or was already used. Log in below to continue.</p>}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field">
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span className="field-row">
            Password
            <Link to="/forgot-password">Forgot password?</Link>
          </span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary btn-lg" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="auth-foot">
        New to Explore Vieques? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  )
}

const NAV_ACTION = { to: '/signup', label: 'Create account' }

const PITCH = {
  title: 'The island is right where you left it.',
  points: [
    'Your saved beaches and restaurants',
    'Your Ask AI conversations',
    'Tonight’s Mosquito Bay moon phase',
  ],
}
