import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { startCheckout } from '../lib/api.js'
import {
  TRAVELER_PLANS, BUSINESS_PLANS,
  TRAVELER_FEATURE_GROUPS, BUSINESS_FEATURE_GROUPS,
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

export default function Pricing() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [aud, setAud] = useState('traveler')
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
  const plans = isTraveler ? TRAVELER_PLANS : BUSINESS_PLANS
  const groups = isTraveler ? TRAVELER_FEATURE_GROUPS : BUSINESS_FEATURE_GROUPS

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.inner}>
        <Link to="/" style={styles.brand}>Explore<span style={{ color: '#06b6d4' }}> Vieques</span></Link>

        <div style={styles.head}>
          <span style={styles.eyebrow}>Pricing</span>
          <h1 style={styles.h1}>Simple pricing for your trip — or your business</h1>
          <p style={styles.sub}>
            {isTraveler
              ? 'Less than one Bio Bay tour. Less than half a day of jeep rental.'
              : "Get found by the people already on the island, looking for exactly what you sell."}
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
        </div>

        {/* ---- Plan cards. Each card carries the FULL feature matrix so the
                columns line up and you can read across to compare. ---- */}
        <div style={styles.plans}>
          {plans.map((p) => (
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
                {groups.map((g) => (
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

        {isTraveler && (
          <>
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
          </>
        )}

        {!isTraveler && (
          <p style={styles.finePrint}>
            Paid placement never buys its way into an AI recommendation. Featured and Partner
            listings break ties among results we already consider equally relevant, and every
            paid placement is visibly labeled.
          </p>
        )}

        {!session && (
          <p style={styles.foot}>
            You'll create an account before paying. <Link to="/login" style={styles.link}>Already have one?</Link>
          </p>
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
  foot: { textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 },
  link: { color: '#67e8f9', fontWeight: 600 },
}
