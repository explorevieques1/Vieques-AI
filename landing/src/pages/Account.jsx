import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, signOut, getSession } from '../lib/supabase.js'
import { fetchEntitlement, deleteAccount } from '../lib/api.js'
import { PLAN_LABELS } from '../lib/plans.js'
import { launchMapApp } from '../lib/mapApp.js'
import AuthLayout from '../components/AuthLayout.jsx'

/** "3 August 2026" — the expiry date is a promise, so spell the month out. */
function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Whole days left on a pass, rounded UP: with 6 hours remaining a customer has
 * "1 day left", not 0.
 *
 * Returns null for open-ended plans (no expiry to count down) AND for a value
 * that will not parse — an unparseable date must fall back to the same neutral
 * "Active" as an open-ended plan, never to "NaN days left".
 */
function daysLeft(expiresAt) {
  if (!expiresAt) return null
  const t = new Date(expiresAt).getTime()
  if (Number.isNaN(t)) return null
  const ms = t - Date.now()
  return ms <= 0 ? 0 : Math.ceil(ms / 86400_000)
}

/**
 * The plan / expiry block.
 *
 * Replaces a hardcoded "No active plan yet" that every user saw regardless of
 * what they had bought — so a customer who paid minutes earlier was told they
 * owned nothing, which reads as a failed payment.
 *
 * Three distinct states, because collapsing them is what caused the original
 * bug: an unreachable API is NOT the same as an empty plan list.
 */
function PlanSection({ ent }) {
  // 1. We asked and could not get an answer. Say so rather than guessing.
  if (!ent?.ok) {
    return (
      <p className="form-note acct-note">
        We couldn't load your plan just now. Refresh, or{' '}
        <Link to="/pricing">see plans</Link> if you haven't bought one.
      </p>
    )
  }

  // 2. Signed in, genuinely holds nothing. (Credits can still be non-zero; the
  //    details list below shows them, guarded so new signups at 0 don't see a row.)
  if (!ent.hasAccess) {
    return (
      <div className="acct-plan acct-plan--none">
        <b className="acct-plan__name">No active plan</b>
        <span className="acct-plan__sub">Choose one to unlock the map.</span>
      </div>
    )
  }

  // 3. Holds at least one pass. `plans` is ordered newest-first by the API, and
  //    a user can legitimately hold more than one (bought Day Trip, upgraded to
  //    Vacation), so render each rather than only the best.
  return (
    <>
      {ent.plans.map((p, i) => {
        const left = daysLeft(p.expires_at)
        const on = formatDate(p.expires_at)
        return (
          <div key={`${p.plan}-${i}`} className="acct-plan">
            <span className="acct-plan__label">{i === 0 ? 'Your plan' : 'Also active'}</span>
            <b className="acct-plan__name">{PLAN_LABELS[p.plan] || p.plan}</b>
            {/* Open-ended plans (and unparseable dates) have no countdown —
                say "Active", never "expires null" or "NaN days left". The
                API only returns unexpired rows, so left === 0 means the pass
                runs out later today, not that it has already lapsed. */}
            <span className="acct-plan__sub">
              <strong>
                {left === null
                  ? 'Active'
                  : left === 0
                    ? 'Expires today'
                    : `${left} day${left === 1 ? '' : 's'} left`}
              </strong>
              {left ? (on ? ` · until ${on}` : '') : ''}
            </span>
          </div>
        )
      })}
    </>
  )
}

export default function Account() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  // null until the entitlement call resolves. Its `ok` flag separates "holds
  // nothing" from "could not reach the API" — see fetchEntitlement.
  const [ent, setEnt] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: sessionData } = await getSession()
      const session = sessionData?.session
      if (!session) {
        navigate('/login')
        return
      }
      if (active) setEmail(session.user.email)

      // Profile comes from Supabase directly (RLS scopes it to our own row);
      // entitlement must come from the API, because the browser's anon key
      // cannot read subscriptions or the credit ledger. Run both at once —
      // they are independent and this page is behind a spinner until both land.
      const [{ data, error }, entitlement] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email, trip_start, trip_end, created_at')
          .eq('id', session.user.id)
          .single(),
        fetchEntitlement(session),
      ])

      if (active) {
        if (!error) setProfile(data)
        setEnt(entitlement)
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [navigate])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  // --- Account deletion ----------------------------------------------------
  // Two steps on purpose: a quiet text button opens the panel, and the panel's
  // button stays disabled until DELETE is typed. The backend checks the same
  // string, so this isn't only a UI guard.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleDelete() {
    setDeleteError('')
    setDeleting(true)
    try {
      const { data } = await getSession()
      await deleteAccount(data?.session)
      // The user no longer exists server-side; this just clears the local
      // token. Ignore its error — there is nothing left to sign out of.
      await signOut().catch(() => {})
      navigate('/', { replace: true })
    } catch (e) {
      setDeleteError(e.message)
      setDeleting(false)
    }
  }

  const credits = Number(ent?.credits ?? 0)
  // Guarded rather than always shown: a brand-new signup sits at 0 and an empty
  // "Ask AI messages 0" row reads as something being broken.
  const showCredits = Boolean(ent?.ok && (ent.hasAccess || credits > 0))

  return (
    <AuthLayout pitch={PITCH} navAction={NAV_ACTION}>
      <h1>Your account</h1>

      {loading ? (
        <div className="acct-skel" role="status" aria-label="Loading your account">
          <span /><span /><span />
        </div>
      ) : (
        <>
          <p className="auth-sub">{profile?.full_name ? `Signed in as ${profile.full_name}.` : 'Your plan and details.'}</p>

          <PlanSection ent={ent} />

          <div className="acct-actions">
            {ent?.hasAccess ? (
              <>
                <button onClick={() => { void launchMapApp() }} className="btn btn-primary btn-lg">Open the map</button>
                <Link to="/pricing" className="acct-link">Add credits or extend</Link>
              </>
            ) : (
              <Link to="/pricing" className="btn btn-primary btn-lg">View plans</Link>
            )}
          </div>

          <dl className="acct-list">
            <div className="acct-row"><dt>Name</dt><dd>{profile?.full_name || '—'}</dd></div>
            <div className="acct-row"><dt>Email</dt><dd>{profile?.email || email}</dd></div>
            <div className="acct-row"><dt>Member since</dt><dd>{formatDate(profile?.created_at) || '—'}</dd></div>
            {showCredits && <div className="acct-row"><dt>Ask AI messages</dt><dd>{credits}</dd></div>}
          </dl>

          <button onClick={handleSignOut} className="btn btn-ghost acct-logout">Log out</button>

          <section className="acct-danger" aria-labelledby="delete-heading">
            {!deleteOpen ? (
              <button onClick={() => setDeleteOpen(true)} className="acct-danger__link">
                Delete account
              </button>
            ) : (
              <div className="acct-danger__panel">
                <h2 id="delete-heading">Delete your account</h2>
                <p>
                  This permanently erases your profile, saved places, trips and Ask AI history.
                  It can’t be undone.
                </p>
                {ent?.hasAccess && (
                  <p>
                    Your active pass ends immediately and isn’t refunded. If you want a refund,{' '}
                    <Link to="/refunds">request it first</Link>.
                  </p>
                )}
                <p>
                  We keep an anonymous record of past payments (amount and date, with no name or
                  email) for tax purposes.
                </p>
                <label className="field">
                  <span>Type <b>DELETE</b> to confirm</span>
                  <input
                    className="input"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                </label>
                {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
                <button
                  onClick={handleDelete}
                  disabled={confirmText !== 'DELETE' || deleting}
                  className="acct-danger__btn"
                >
                  {deleting ? 'Deleting…' : 'Permanently delete account'}
                </button>
                <button
                  onClick={() => { setDeleteOpen(false); setConfirmText(''); setDeleteError('') }}
                  className="btn btn-ghost acct-logout"
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </AuthLayout>
  )
}

const NAV_ACTION = { to: '/', label: 'Home' }

const PITCH = {
  title: 'Everything for the trip, in one place.',
  points: [
    'Your pass and days left, always in view',
    'Saved places and trips stay with you',
    'Open the map from any phone, nothing to install',
  ],
}
