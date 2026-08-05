import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { startCheckout, joinBusinessWaitlist } from '../lib/api.js'
import {
  TRAVELER_PLANS,
  TRAVELER_FEATURE_GROUPS,
  BUSINESS_PREVIEW,
  ADDONS,
} from '../lib/plans.js'

// Renders one cell of the comparison matrix. The value vocabulary is defined in
// lib/plans.js: true → ✓, false → ✗, null → n/a, string → the string itself.
function FeatureValue({ value }) {
  if (value === true) return <span style={styles.yes} aria-label="Included">✓</span>
  if (value === false) return <span style={styles.no} aria-label="Not included">✗</span>
  if (value === null) return <span style={styles.na} aria-label="Not applicable">—</span>
  return <span style={styles.val}>{value}</span>
}

/**
 * The business tab. Collects an email instead of a card.
 *
 * There is no pricing here on purpose — see the long note in lib/plans.js. The
 * business product does not exist yet, and the plans that used to sit on this
 * tab would have charged $19–$149/month for the free tier. Publishing a price
 * before the product is real also commits us to a number we have not tested.
 */
function BusinessWaitlist() {
  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setState('sending')
    try {
      await joinBusinessWaitlist({ email, businessName, note })
      setState('done')
    } catch (err) {
      setError(err.message || 'Could not save your details.')
      setState('idle')
    }
  }

  // Confirmation replaces the form entirely rather than sitting above it — a
  // form still on screen after a successful submit reads as "it didn't work".
  if (state === 'done') {
    return (
      <div style={styles.bizWrap}>
        <div style={styles.bizCard}>
          <div style={styles.bizCheck} aria-hidden="true">✓</div>
          <h3 style={styles.bizDoneTitle}>You're on the list</h3>
          <p style={styles.bizBlurb}>
            We'll email <strong style={{ color: '#e2e8f0' }}>{email}</strong> when business
            listings open up. No charge, and nothing else in the meantime.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.bizWrap}>
      <div style={styles.bizCard}>
        <span style={styles.bizTag}>In development</span>
        <h3 style={styles.bizTitle}>{BUSINESS_PREVIEW.headline}</h3>
        <p style={styles.bizBlurb}>{BUSINESS_PREVIEW.blurb}</p>

        <ul style={styles.bizList}>
          {BUSINESS_PREVIEW.planned.map((item) => (
            <li key={item} style={styles.bizItem}>
              <span style={styles.bizDot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <form onSubmit={submit} style={styles.bizForm}>
          <label htmlFor="biz-email" style={styles.bizLabel}>Email</label>
          <input
            id="biz-email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            style={styles.bizInput}
          />

          <label htmlFor="biz-name" style={styles.bizLabel}>Business name <span style={styles.bizOpt}>optional</span></label>
          <input
            id="biz-name" type="text" value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Kiosko La Pared"
            style={styles.bizInput}
          />

          <label htmlFor="biz-note" style={styles.bizLabel}>What would you want from it? <span style={styles.bizOpt}>optional</span></label>
          <textarea
            id="biz-note" rows={3} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tells us what to build first."
            style={{ ...styles.bizInput, resize: 'vertical', minHeight: 72 }}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.bizBtn} disabled={state === 'sending'}>
            {state === 'sending' ? 'Adding you…' : 'Join the waitlist'}
          </button>
        </form>

        <p style={styles.bizPromise}>{BUSINESS_PREVIEW.promise}</p>
      </div>
    </div>
  )
}

export default function Pricing() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // ?for=business opens straight on the waitlist tab — the homepage's business
  // CTA links here, and dropping those visitors on the traveler tab loses them.
  const [aud, setAud] = useState(params.get('for') === 'business' ? 'business' : 'traveler')
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(null) // which plan is processing
  const [error, setError] = useState('')
  const canceled = params.get('checkout') === 'cancel'

  useEffect(() => {
    getSession().then(({ data }) => setSession(data?.session || null))
  }, [])

  // Free tiers skip Stripe entirely — they just need an account.
  async function choose(plan) {
    setError('')
    if (!plan.checkout) {
      navigate(session ? '/account' : `/signup?plan=${encodeURIComponent(plan.key)}`)
      return
    }
    // Must be signed in so the webhook can attach the purchase to a real user.
    if (!session) {
      navigate(`/signup?plan=${encodeURIComponent(plan.key)}`)
      return
    }
    setBusy(plan.key)
    try {
      await startCheckout(plan.key, session) // redirects to Stripe on success
    } catch (e) {
      setError(e.message || 'Could not start checkout.')
      setBusy(null)
    }
  }

  const isTraveler = aud === 'traveler'

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.inner}>
        <Link to="/" style={styles.brand}>Explore<span style={{ color: '#06b6d4' }}> Vieques</span></Link>

        <div style={styles.head}>
          <span style={styles.eyebrow}>Pricing</span>
          <h1 style={styles.h1}>
            {isTraveler ? 'Simple pricing for your trip' : 'Business listings are coming'}
          </h1>
          <p style={styles.sub}>
            {isTraveler
              ? 'Less than one Bio Bay tour. Less than half a day of jeep rental.'
              : 'Not open yet — tell us where to reach you and you’ll be first in.'}
          </p>
        </div>

        {canceled && <p style={styles.cancel}>Checkout canceled — no charge was made. You can try again below.</p>}
        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.toggle} role="tablist">
          <button role="tab" aria-selected={isTraveler}
            style={isTraveler ? styles.tOn : styles.tOff}
            onClick={() => setAud('traveler')}>For Travelers</button>
          <button role="tab" aria-selected={!isTraveler}
            style={!isTraveler ? styles.tOn : styles.tOff}
            onClick={() => setAud('business')}>For Businesses</button>
          {/* No "soon" badge on the tab itself — the tab is a filter, and the
              state belongs on the panel it opens, which says it plainly. */}
        </div>

        {isTraveler ? (
          <>
            {/* ---- Plan cards. Each card carries the FULL feature matrix so the
                    columns line up and you can read across to compare. ---- */}
            <div style={styles.plans}>
              {TRAVELER_PLANS.map((p) => (
                <div key={p.key} style={{ ...styles.plan, ...(p.featured ? styles.planFeatured : {}) }}>
                  {p.badge && <span style={styles.badge}>{p.badge}</span>}

                  <div style={styles.planHead}>
                    <h3 style={styles.planName}>{p.name}</h3>
                    <p style={styles.tagline}>{p.tagline}</p>
                    <div style={styles.price}>{p.price}<small style={styles.unit}>{p.unit}</small></div>
                  </div>

                  <button
                    style={p.featured ? styles.btnPrimary : styles.btnGhost}
                    onClick={() => choose(p)}
                    disabled={busy === p.key}
                  >
                    {busy === p.key ? 'Redirecting…' : p.cta}
                  </button>

                  <div style={styles.matrix}>
                    {TRAVELER_FEATURE_GROUPS.map((g) => (
                      <div key={g.group}>
                        <div style={styles.groupLabel}>{g.group}</div>
                        {g.rows.map((row) => {
                          const value = row.values[p.key]
                          const off = value === false || value === null
                          return (
                            <div key={row.label} style={styles.row}>
                              <span style={{ ...styles.rowLabel, ...(off ? styles.rowLabelOff : {}) }}
                                title={row.hint || undefined}>
                                {row.label}
                              </span>
                              <FeatureValue value={value} />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.addons}>
              <h4 style={styles.addonsTitle}>Add-ons</h4>
              <div style={styles.addonGrid}>
                {ADDONS.map((a) => (
                  <div key={a.key} style={styles.addon}>
                    <div>
                      <div style={styles.addonName}>{a.name}</div>
                      <div style={styles.addonBlurb}>{a.blurb}</div>
                    </div>
                    <button style={styles.addonBtn}
                      onClick={() => choose({ key: a.key, checkout: true })}
                      disabled={busy === a.key}>
                      {busy === a.key ? '…' : a.price}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <p style={styles.finePrint}>
              Exploration includes 150 Ask AI messages per pass — enough that most travelers
              never think about it. Passes are one-time purchases, not subscriptions.
            </p>

            {!session && (
              <p style={styles.foot}>
                You'll create an account before paying. <Link to="/login" style={styles.link}>Already have one?</Link>
              </p>
            )}

            {/* The refund terms belong next to the buy button, not only in the
                homepage footer — this is the page where someone is deciding to
                pay, and "what if my ferry is cancelled" is the question they
                have right now. */}
            <p style={styles.legalFoot}>
              Trip fell through? Unused passes are refundable within 7 days — see our{' '}
              <Link to="/refunds" style={styles.link}>refund policy</Link>. By buying you agree to our{' '}
              <Link to="/terms" style={styles.link}>terms</Link> and{' '}
              <Link to="/privacy" style={styles.link}>privacy policy</Link>.
            </p>
          </>
        ) : (
          <BusinessWaitlist />
        )}
      </div>
    </main>
  )
}

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', background: '#0f172a', padding: '48px 24px 72px', fontFamily: 'Manrope, system-ui, sans-serif', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(900px 500px at 50% -10%, rgba(6,182,212,.12), transparent 60%)' },
  inner: { position: 'relative', maxWidth: 1240, margin: '0 auto' },
  brand: { fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2e8f0', textDecoration: 'none' },
  head: { textAlign: 'center', margin: '32px 0 28px' },
  eyebrow: { display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#67e8f9', border: '1px solid rgba(6,182,212,.3)', background: 'rgba(6,182,212,.08)', padding: '6px 14px', borderRadius: 999 },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 'clamp(26px,3.4vw,38px)', margin: '16px 0 10px' },
  sub: { color: '#94a3b8', fontSize: 15, maxWidth: 560, margin: '0 auto' },
  cancel: { textAlign: 'center', color: '#fcd34d', fontSize: 14, marginBottom: 12 },
  error: { textAlign: 'center', color: '#fca5a5', fontSize: 14, marginBottom: 12 },
  toggle: { display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'rgba(148,163,184,.1)', border: '1px solid rgba(148,163,184,.14)', width: 'fit-content', margin: '0 auto 32px' },
  tOn: { border: 0, background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 999, cursor: 'pointer' },
  tOff: { border: 0, background: 'none', color: '#94a3b8', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 999, cursor: 'pointer' },

  plans: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(258px, 1fr))', alignItems: 'start' },
  plan: { position: 'relative', padding: '26px 20px 22px', borderRadius: 18, background: '#111c33', border: '1px solid rgba(148,163,184,.14)', display: 'flex', flexDirection: 'column' },
  planFeatured: { border: '1px solid #06b6d4', boxShadow: '0 0 0 1px rgba(6,182,212,.25), 0 20px 50px rgba(6,182,212,.10)' },
  badge: { position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#06b6d4', color: '#0b1120', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap' },
  planHead: { minHeight: 148 },
  planName: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 20, margin: 0 },
  tagline: { color: '#94a3b8', fontSize: 12.5, margin: '6px 0 0', minHeight: 32 },
  price: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 38, fontWeight: 700, lineHeight: 1, margin: '14px 0 0' },
  unit: { display: 'block', fontFamily: 'Manrope, sans-serif', fontSize: 12, fontWeight: 500, color: '#94a3b8', marginTop: 7 },

  btnPrimary: { padding: '11px 18px', borderRadius: 10, border: 'none', background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', width: '100%' },
  btnGhost: { padding: '11px 18px', borderRadius: 10, background: 'transparent', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.2)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', width: '100%' },

  matrix: { marginTop: 20, borderTop: '1px solid rgba(148,163,184,.12)', paddingTop: 4 },
  groupLabel: { fontSize: 10, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#64748b', margin: '16px 0 6px' },
  // Fixed row height is what keeps the four cards' rows aligned so you can
  // actually read across them. Don't make this content-dependent.
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 30, borderBottom: '1px solid rgba(148,163,184,.06)' },
  rowLabel: { fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.25 },
  rowLabelOff: { color: '#64748b' },
  yes: { color: '#06b6d4', fontWeight: 800, fontSize: 14, flexShrink: 0 },
  no: { color: '#475569', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  na: { color: '#475569', fontSize: 13, flexShrink: 0 },
  val: { color: '#e2e8f0', fontSize: 11.5, fontWeight: 700, textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' },

  addons: { marginTop: 40 },
  addonsTitle: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 16, margin: '0 0 12px' },
  addonGrid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' },
  addon: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', borderRadius: 14, background: '#111c33', border: '1px solid rgba(148,163,184,.14)' },
  addonName: { color: '#e2e8f0', fontSize: 14, fontWeight: 700 },
  addonBlurb: { color: '#94a3b8', fontSize: 12.5, marginTop: 3 },
  addonBtn: { padding: '9px 16px', borderRadius: 9, background: 'transparent', color: '#67e8f9', border: '1px solid rgba(6,182,212,.35)', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' },

  finePrint: { textAlign: 'center', color: '#64748b', fontSize: 12.5, maxWidth: 620, margin: '28px auto 0', lineHeight: 1.55 },
  legalFoot: { textAlign: 'center', color: '#64748b', fontSize: 12, maxWidth: 620, margin: '18px auto 0', lineHeight: 1.6 },
  foot: { textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 },
  link: { color: '#67e8f9', fontWeight: 600 },

  // ---- Business waitlist ----------------------------------------------------
  // Narrower than the traveler grid on purpose: one column of prose and a form
  // reads as an invitation, where a full-width panel would imply a product
  // catalog that isn't there.
  bizWrap: { display: 'flex', justifyContent: 'center' },
  bizCard: { width: '100%', maxWidth: 560, padding: '30px 28px', borderRadius: 18, background: '#111c33', border: '1px solid rgba(148,163,184,.14)' },
  bizTag: { display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#fcd34d', border: '1px solid rgba(252,211,77,.3)', background: 'rgba(252,211,77,.08)', padding: '5px 11px', borderRadius: 999 },
  bizTitle: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 22, margin: '16px 0 10px', lineHeight: 1.25 },
  bizBlurb: { color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: 0 },

  bizList: { listStyle: 'none', padding: 0, margin: '20px 0 24px', display: 'flex', flexDirection: 'column', gap: 9 },
  bizItem: { display: 'flex', alignItems: 'flex-start', gap: 10, color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.45 },
  // A neutral dot, not a ✓. A checkmark would read as "included", and none of
  // these are included yet — that distinction is the whole point of this tab.
  bizDot: { width: 5, height: 5, borderRadius: '50%', background: '#475569', marginTop: 7, flexShrink: 0 },

  bizForm: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 22, borderTop: '1px solid rgba(148,163,184,.12)' },
  bizLabel: { color: '#94a3b8', fontSize: 12.5, fontWeight: 600, marginTop: 8 },
  bizOpt: { color: '#64748b', fontWeight: 500, fontSize: 11.5 },
  bizInput: { width: '100%', padding: '11px 13px', borderRadius: 10, background: '#0f172a', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none' },
  bizBtn: { marginTop: 18, padding: '12px 20px', borderRadius: 10, border: 'none', background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' },
  bizPromise: { color: '#64748b', fontSize: 12, lineHeight: 1.55, margin: '20px 0 0', paddingTop: 16, borderTop: '1px solid rgba(148,163,184,.08)' },

  bizCheck: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(6,182,212,.12)', border: '1px solid rgba(6,182,212,.35)', color: '#67e8f9', display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 800, marginBottom: 16 },
  bizDoneTitle: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 21, margin: '0 0 10px' },
}
