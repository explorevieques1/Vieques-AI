import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { startCheckout } from '../lib/api.js'

const TRAVELER_PLANS = [
  { key: 'traveler', name: 'Traveler Plan', price: '$9', unit: 'one-time · 30 days', featured: true, badge: 'Most popular',
    features: ['Unlimited Ask AI questions', 'All categories & smart filters', 'Snorkeling zone maps', 'Directions & routing', 'Restaurant profiles'], cta: 'Get Traveler Access' },
  { key: 'credits', name: 'Credits', price: '$3', unit: 'per credit pack', featured: false,
    features: ['20 Ask AI queries per pack', 'Map browsing always free', 'Credits never expire', 'Top up anytime'], cta: 'Buy Credits' },
]
const BUSINESS_PLANS = [
  { key: 'business_basic', name: 'Basic', price: '$29', unit: '/month', featured: false,
    features: ['Your pin on the island map', 'Full profile: hours, prices, contact', 'Appears in filters & search', 'Update your listing anytime'], cta: 'List My Business' },
  { key: 'business_featured', name: 'Featured', price: '$79', unit: '/month', featured: true, badge: 'Recommended',
    features: ['Everything in Basic', 'Priority placement in results', 'Highlighted in AI recommendations', 'Featured badge & custom marker', 'Seasonal promo slots'], cta: 'Get Featured' },
]

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

  async function buy(planKey) {
    setError('')
    // must be signed in to attach the purchase to a user
    if (!session) {
      navigate(`/signup?plan=${encodeURIComponent(planKey)}`)
      return
    }
    setBusy(planKey)
    try {
      await startCheckout(planKey, session) // redirects to Stripe on success
    } catch (e) {
      setError(e.message || 'Could not start checkout.')
      setBusy(null)
    }
  }

  const plans = aud === 'traveler' ? TRAVELER_PLANS : BUSINESS_PLANS

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.inner}>
        <Link to="/" style={styles.brand}>Explore<span style={{ color: '#06b6d4' }}> Vieques</span></Link>

        <div style={styles.head}>
          <span style={styles.eyebrow}>Pricing</span>
          <h1 style={styles.h1}>Simple pricing for your trip — or your business</h1>
          <p style={styles.sub}>Visiting the island, or running a business on it? Either way, there's a plan.</p>
        </div>

        {canceled && <p style={styles.cancel}>Checkout canceled — no charge was made. You can try again below.</p>}
        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.toggle}>
          <button style={aud === 'traveler' ? styles.tOn : styles.tOff} onClick={() => setAud('traveler')}>For Travelers</button>
          <button style={aud === 'business' ? styles.tOn : styles.tOff} onClick={() => setAud('business')}>For Businesses</button>
        </div>

        <div style={styles.plans}>
          {plans.map((p) => (
            <div key={p.key} style={{ ...styles.plan, ...(p.featured ? styles.planFeatured : {}) }}>
              {p.badge && <span style={styles.badge}>{p.badge}</span>}
              <h3 style={styles.planName}>{p.name}</h3>
              <div style={styles.price}>{p.price}<small style={styles.unit}>{p.unit}</small></div>
              <ul style={styles.ul}>
                {p.features.map((f) => <li key={f} style={styles.li}><span style={{ color: '#06b6d4' }}>✓</span> {f}</li>)}
              </ul>
              <button
                style={p.featured ? styles.btnPrimary : styles.btnGhost}
                onClick={() => buy(p.key)}
                disabled={busy === p.key}
              >
                {busy === p.key ? 'Redirecting…' : p.cta}
              </button>
            </div>
          ))}
        </div>

        {!session && <p style={styles.foot}>You'll create an account before paying. <Link to="/login" style={styles.link}>Already have one?</Link></p>}
      </div>
    </main>
  )
}

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', background: '#0f172a', padding: '48px 24px', fontFamily: 'Manrope, system-ui, sans-serif', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(900px 500px at 50% -10%, rgba(6,182,212,.12), transparent 60%)' },
  inner: { position: 'relative', maxWidth: 900, margin: '0 auto' },
  brand: { fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2e8f0', textDecoration: 'none' },
  head: { textAlign: 'center', margin: '32px 0 32px' },
  eyebrow: { display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#67e8f9', border: '1px solid rgba(6,182,212,.3)', background: 'rgba(6,182,212,.08)', padding: '6px 14px', borderRadius: 999 },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 'clamp(26px,3.4vw,38px)', margin: '16px 0 10px' },
  sub: { color: '#94a3b8', fontSize: 15, maxWidth: 560, margin: '0 auto' },
  cancel: { textAlign: 'center', color: '#fcd34d', fontSize: 14, marginBottom: 12 },
  error: { textAlign: 'center', color: '#fca5a5', fontSize: 14, marginBottom: 12 },
  toggle: { display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'rgba(148,163,184,.1)', border: '1px solid rgba(148,163,184,.14)', width: 'fit-content', margin: '0 auto 32px' },
  tOn: { border: 0, background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 999, cursor: 'pointer' },
  tOff: { border: 0, background: 'none', color: '#94a3b8', fontWeight: 700, fontSize: 13, padding: '9px 20px', borderRadius: 999, cursor: 'pointer' },
  plans: { display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' },
  plan: { position: 'relative', padding: '30px 26px', borderRadius: 18, background: '#111c33', border: '1px solid rgba(148,163,184,.14)', display: 'flex', flexDirection: 'column' },
  planFeatured: { border: '1px solid #06b6d4', boxShadow: '0 0 0 1px rgba(6,182,212,.25), 0 20px 50px rgba(6,182,212,.10)' },
  badge: { position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#06b6d4', color: '#0b1120', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap' },
  planName: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 20, margin: 0 },
  price: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 44, fontWeight: 700, lineHeight: 1, margin: '14px 0' },
  unit: { display: 'block', fontFamily: 'Manrope, sans-serif', fontSize: 12.5, fontWeight: 500, color: '#94a3b8', marginTop: 6 },
  ul: { listStyle: 'none', padding: 0, margin: '10px 0 22px', display: 'grid', gap: 10, flex: 1 },
  li: { display: 'flex', gap: 9, fontSize: 14, color: '#cbd5e1' },
  btnPrimary: { padding: '12px 20px', borderRadius: 10, border: 'none', background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnGhost: { padding: '12px 20px', borderRadius: 10, background: 'transparent', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.2)', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  foot: { textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 24 },
  link: { color: '#67e8f9', fontWeight: 600 },
}