import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { signUp } from '../lib/supabase.js'
import { SELLABLE_TRAVELER_PLANS } from '../lib/plans.js'
import AuthLayout, { AuthTrust } from '../components/AuthLayout.jsx'
import { TERMS_VERSION } from '../lib/legal.js'
import { getAttribution } from '../lib/attribution.js'

export default function SignUp() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = params.get('plan') // set when they clicked a pricing button
  // The pass they picked, for the summary above the form. Unknown keys (an old
  // link, a typo) just render no summary — signup itself doesn't need a plan.
  const chosen = SELLABLE_TRAVELER_PLANS.find((p) => p.key === plan) || null

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Clickwrap consent. Starts unticked on purpose — a pre-ticked box is not
  // agreement. The version shown is recorded by handle_new_user() (0051).
  const [agreed, setAgreed] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!agreed) {
      setError('Tick the box to confirm you’re 18 or older and agree to the Terms and Privacy Policy.')
      return
    }

    setStatus('submitting')

    // Supabase Auth creates the auth.users row; the DB trigger then
    // creates the matching profiles row automatically. We pass full_name
    // in metadata so the trigger can populate it.
    // emailRedirectTo must be explicit. Without it Supabase falls back to the
    // dashboard's Site URL, which silently points confirmation links at
    // whatever that happens to be set to. We also carry the chosen plan
    // through the email so they land back in the funnel they started in.
    const confirmUrl = new URL('/welcome', window.location.origin)
    if (plan) confirmUrl.searchParams.set('plan', plan)

    const { data, error: signUpError } = await signUp(email, password, {
      // Attribution first so it can never overwrite the real fields.
      data: { ...getAttribution(), full_name: name, terms_version: TERMS_VERSION },
      emailRedirectTo: confirmUrl.toString(),
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
      <AuthLayout pitch={PITCH} navAction={NAV_ACTION}>
        <h1>Check your email</h1>
        <p className="auth-sub">
          We sent a confirmation link to <strong>{email}</strong>. Click it and you’ll be signed in
          automatically — no need to come back here.
        </p>
        <p className="auth-sub">Nothing yet? Check your spam folder. The link expires in 24 hours.</p>
        <Link to="/login" className="btn btn-ghost btn-lg" style={{ width: '100%' }}>Go to log in</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout pitch={PITCH} navAction={NAV_ACTION}>
      <h1>Create your account</h1>
      <p className="auth-sub">
        {chosen ? 'Confirm your email next, then check out on the pricing page.' : 'Free to create. Pick a pass when you’re ready.'}
      </p>

      {chosen && (
        <div className="auth-plan">
          <div>
            <b>{chosen.name} pass</b>
            <span>{chosen.unit}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="price-tag">{chosen.price}</div>
            <Link to="/pricing">Change</Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="field">
          Name
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>

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
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {/* Links open in a new tab so reading the terms doesn't throw away
            what has been typed into the form. */}
        <label className="consent">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setError('') }}
          />
          <span>
            I’m 18 or older and agree to the{' '}
            <Link to="/terms" target="_blank" rel="noopener">Terms of Service</Link> and{' '}
            <Link to="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
          </span>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary btn-lg" disabled={status === 'submitting'}>
          {status === 'submitting'
            ? 'Creating account…'
            : chosen ? 'Create account and continue' : 'Create account'}
        </button>
      </form>

      {chosen && <AuthTrust />}

      <p className="auth-foot">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  )
}

const NAV_ACTION = { to: '/login', label: 'Log in' }

const PITCH = {
  title: 'Land on Vieques knowing where to go.',
  points: [
    'All 17 beaches, with 4×4 and access notes',
    'Snorkel zones drawn on the water',
    'An AI guide that answers with pins',
  ],
}
