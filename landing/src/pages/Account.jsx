import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, signOut, getSession } from '../lib/supabase.js'
import { fetchEntitlement, deleteAccount } from '../lib/api.js'
import { PLAN_LABELS } from '../lib/plans.js'
import { launchMapApp } from '../lib/mapApp.js'

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
 * The plan / expiry / credits block.
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
      <div style={{ ...styles.note, ...styles.noteMuted }}>
        We couldn't load your plan just now. Refresh, or{' '}
        <Link to="/pricing" style={styles.link}>see plans</Link> if you haven't bought one.
      </div>
    )
  }

  const credits = Number(ent.credits ?? 0)

  // 2. Signed in, genuinely holds nothing. Credits can still be non-zero: an
  //    account that bought a credit pack without a pass, or a pre-0048 account
  //    that kept its signup bonus. New signups land here at 0 and the row below
  //    is hidden, which is why it is guarded rather than always rendered.
  if (!ent.hasAccess) {
    return (
      <>
        <div style={styles.note}>No active plan yet. Choose one to unlock the map.</div>
        {credits > 0 && (
          <div style={styles.row}>
            <span style={styles.k}>Ask AI messages</span>
            <span style={styles.v}>{credits}</span>
          </div>
        )}
      </>
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
          <div key={`${p.plan}-${i}`} style={styles.row}>
            <span style={styles.k}>{i === 0 ? 'Plan' : 'Also active'}</span>
            <span style={styles.v}>
              {PLAN_LABELS[p.plan] || p.plan}
              {/* Open-ended plans (and unparseable dates) have no countdown —
                  say "Active", never "expires null" or "NaN days left". The
                  API only returns unexpired rows, so left === 0 means the pass
                  runs out later today, not that it has already lapsed. */}
              <small style={styles.vSub}>
                {left === null
                  ? 'Active'
                  : left === 0
                    ? 'Expires today'
                    : `${left} day${left === 1 ? '' : 's'} left${on ? ` · until ${on}` : ''}`}
              </small>
            </span>
          </div>
        )
      })}
      <div style={styles.row}>
        <span style={styles.k}>Ask AI messages</span>
        <span style={styles.v}>{credits}</span>
      </div>
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

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.card}>
        <Link to="/" style={styles.brand}>
          Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
        </Link>

        <h1 style={styles.h1}>Your account</h1>

        {loading ? (
          <p style={styles.sub}>Loading…</p>
        ) : (
          <>
            <div style={styles.row}><span style={styles.k}>Name</span><span style={styles.v}>{profile?.full_name || '—'}</span></div>
            <div style={styles.row}><span style={styles.k}>Email</span><span style={styles.v}>{profile?.email || email}</span></div>
            <div style={styles.row}><span style={styles.k}>Member since</span><span style={styles.v}>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</span></div>

            <PlanSection ent={ent} />

            {ent?.hasAccess ? (
              <>
                <button onClick={() => { void launchMapApp() }} style={styles.btn}>Open the map</button>
                <Link to="/pricing" style={styles.ghostLink}>Add credits or extend</Link>
              </>
            ) : (
              <Link to="/pricing" style={styles.btn}>View plans</Link>
            )}
            <button onClick={handleSignOut} style={styles.ghost}>Log out</button>

            <section style={styles.danger} aria-labelledby="delete-heading">
              {!deleteOpen ? (
                <button onClick={() => setDeleteOpen(true)} style={styles.dangerLink}>
                  Delete account
                </button>
              ) : (
                <>
                  <h2 id="delete-heading" style={styles.dangerH}>Delete your account</h2>
                  <p style={styles.dangerP}>
                    This permanently erases your profile, saved places, trips and Ask AI history.
                    It can’t be undone.
                  </p>
                  {ent?.hasAccess && (
                    <p style={styles.dangerP}>
                      Your active pass ends immediately and isn’t refunded. If you want a refund,{' '}
                      <Link to="/refunds" style={styles.link}>request it first</Link>.
                    </p>
                  )}
                  <p style={styles.dangerP}>
                    We keep an anonymous record of past payments (amount and date, with no name or
                    email) for tax purposes.
                  </p>
                  <label style={styles.dangerLabel}>
                    Type <b>DELETE</b> to confirm
                    <input
                      className="input"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      style={{ marginTop: 6 }}
                    />
                  </label>
                  {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
                  <button
                    onClick={handleDelete}
                    disabled={confirmText !== 'DELETE' || deleting}
                    style={{ ...styles.dangerBtn, opacity: confirmText !== 'DELETE' || deleting ? 0.45 : 1 }}
                  >
                    {deleting ? 'Deleting…' : 'Permanently delete account'}
                  </button>
                  <button
                    onClick={() => { setDeleteOpen(false); setConfirmText(''); setDeleteError('') }}
                    style={styles.ghost}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--pearl)', padding: 24, fontFamily: 'var(--font)', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(700px 400px at 70% -10%, rgba(100,219,232,.13), transparent 60%)' },
  card: { position: 'relative', width: '100%', maxWidth: 420, background: 'var(--pearl-2)', border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 32, boxShadow: '0 30px 80px rgba(0,0,0,.4)' },
  brand: { fontFamily: 'var(--font)', fontWeight: 700, fontSize: 18, color: 'var(--text)', textDecoration: 'none', display: 'inline-block', marginBottom: 20 },
  h1: { fontFamily: 'var(--font)', color: 'var(--text)', fontSize: 26, margin: '0 0 20px' },
  sub: { color: 'var(--muted)', fontSize: 14 },
  // align-items:flex-start keeps the label on the first line when the value
  // wraps to two (plan name + expiry sub-line).
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(148,163,184,.1)' },
  k: { color: 'var(--muted)', fontSize: 13, paddingTop: 1, flexShrink: 0 },
  v: { color: 'var(--text)', fontSize: 14, fontWeight: 600, textAlign: 'right' },
  // The expiry sits under the plan name rather than beside it: "4 days left" is
  // the number people actually look for, and it needs room to be legible.
  vSub: { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 500, marginTop: 3 },
  note: { margin: '20px 0', padding: '12px 14px', borderRadius: 10, background: 'rgba(100,219,232,.08)', border: '1px solid rgba(100,219,232,.25)', color: 'var(--sea)', fontSize: 13 },
  // Amber, not cyan: this is a degraded state, and it should not look like an
  // affirmative answer about what the user owns.
  noteMuted: { background: 'rgba(148,163,184,.07)', border: '1px solid rgba(148,163,184,.18)', color: 'var(--text)' },
  btn: { display: 'block', width: '100%', textAlign: 'center', padding: '12px 20px', borderRadius: 999, background: 'var(--flush)', color: '#1A0A00', fontWeight: 700, fontSize: 14, textDecoration: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 },
  ghostLink: { display: 'block', textAlign: 'center', padding: '11px 20px', borderRadius: 10, background: 'transparent', color: 'var(--muted)', border: '1px solid rgba(148,163,184,.2)', fontWeight: 600, fontSize: 14, textDecoration: 'none', marginBottom: 10 },
  ghost: { width: '100%', padding: '11px 20px', borderRadius: 10, background: 'transparent', color: 'var(--muted)', border: '1px solid rgba(148,163,184,.2)', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  link: { color: 'var(--sea)', fontWeight: 600 },
  // Danger zone. Red, not --flush: orange means "buy/start" in this design
  // system, and an orange delete button would read as a call to action.
  danger: { marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(148,163,184,.14)' },
  dangerLink: { display: 'block', margin: '0 auto', background: 'none', border: 'none', color: 'var(--faint)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 },
  dangerH: { fontFamily: 'var(--font)', color: '#FF6B6B', fontSize: 16, margin: '0 0 10px' },
  dangerP: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, margin: '0 0 10px' },
  dangerLabel: { display: 'block', color: 'var(--text)', fontSize: 13, margin: '14px 0 14px' },
  dangerBtn: { width: '100%', padding: '12px 20px', borderRadius: 999, background: '#E5484D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 },
}