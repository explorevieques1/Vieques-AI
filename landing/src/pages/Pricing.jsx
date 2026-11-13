import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { startCheckout, joinBusinessWaitlist } from '../lib/api.js'
import {
  SELLABLE_TRAVELER_PLANS,
  SELLABLE_TRAVELER_FEATURE_GROUPS,
  PLAN_HIGHLIGHTS,
  BUSINESS_PREVIEW,
  ADDONS,
} from '../lib/plans.js'
import NavBar from '../components/NavBar.jsx'
import { CheckIcon } from '../components/icons.jsx'
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx'
import StarBorder from '../components/reactbits/StarBorder.jsx'
import SplitText from '../components/reactbits/SplitText.jsx'
import AnimatedContent from '../components/reactbits/AnimatedContent.jsx'

// Same re-skin of React Bits SpotlightCard as the homepage cards.
const CARD_STYLE = {
  '--spotlight-card-surface': '#0A202D',
  '--spotlight-card-border': 'rgba(143,169,180,.14)',
  '--spotlight-card-shadow': 'none',
}

// One cell of the comparison table. Value vocabulary is defined in
// lib/plans.js: true → included, false → not included, null → n/a, string → shown as-is.
function FeatureValue({ value }) {
  if (value === true) return <span className="yes" aria-label="Included"><CheckIcon /></span>
  if (value === false) return <span className="no" aria-label="Not included">—</span>
  if (value === null) return <span className="no" aria-label="Not applicable">n/a</span>
  return <span className="txt">{value}</span>
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
      <div className="biz">
        <SpotlightCard className="biz-card biz-done" spotlightColor="#64DBE8" intensity={0.1} style={CARD_STYLE}>
          <CheckIcon width={36} height={36} />
          <h2>You’re on the list</h2>
          <p>
            We’ll email <strong style={{ color: 'var(--text)' }}>{email}</strong> when business
            listings open up. No charge, and nothing else in the meantime.
          </p>
        </SpotlightCard>
      </div>
    )
  }

  return (
    <div className="biz">
      <SpotlightCard className="biz-card" spotlightColor="#64DBE8" intensity={0.1} style={CARD_STYLE}>
        <span className="badge" style={{ background: 'var(--pearl-3)', color: 'var(--text)' }}>In development</span>
        <h2>{BUSINESS_PREVIEW.headline}</h2>
        <p>{BUSINESS_PREVIEW.blurb}</p>

        <ul>
          {BUSINESS_PREVIEW.planned.map((item) => (
            <li key={item}><CheckIcon width={16} height={16} />{item}</li>
          ))}
        </ul>

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            Email
            <input type="email" required value={email} className="input"
              onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" />
          </label>
          <label className="field">
            <span>Business name <span className="opt">optional</span></span>
            <input type="text" value={businessName} className="input"
              onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Kiosko La Pared" />
          </label>
          <label className="field">
            <span>What would you want from it? <span className="opt">optional</span></span>
            <textarea rows={3} value={note} className="input"
              onChange={(e) => setNote(e.target.value)} placeholder="Tells us what to build first." />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={state === 'sending'}>
            {state === 'sending' ? 'Adding you…' : 'Join the waitlist'}
          </button>
        </form>

        <p className="biz-promise">{BUSINESS_PREVIEW.promise}</p>
      </SpotlightCard>
    </div>
  )
}

export default function Pricing() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  // ?for=business opens straight on the waitlist tab — the homepage's business
  // CTA links here, and dropping those visitors on the traveler tab loses them.
  const [aud, setAud] = useState(params.get('for') === 'business' ? 'business' : 'traveler')
  const [session, setSession] = useState(null)
  const [busy, setBusy] = useState(null) // which plan is processing
  const [error, setError] = useState('')
  const canceled = params.get('checkout') === 'cancel'
  // ?plan= is set by SignUp/Welcome after account creation: the pass they
  // already chose. We mark it so the one remaining click is obvious.
  const picked = params.get('plan')

  useEffect(() => {
    getSession().then(({ data }) => setSession(data?.session || null))
  }, [])

  // /pricing#compare (the homepage's "Compare every feature") — this route is
  // lazy-loaded, so the browser's own hash jump fires before the table exists.
  useEffect(() => {
    if (location.hash !== '#compare') return
    const t = setTimeout(() => document.getElementById('compare')?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [location.hash])

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
  const cols = SELLABLE_TRAVELER_PLANS

  function planButton(p, extraClass = '') {
    const primary = picked ? p.key === picked : p.featured
    return (
      <button
        className={`btn ${primary ? 'btn-primary' : 'btn-ghost'} ${extraClass}`}
        onClick={() => choose(p)}
        disabled={busy === p.key}
      >
        {busy === p.key ? 'Redirecting…' : p.cta}
      </button>
    )
  }

  return (
    <div className="pricing-page">
      <NavBar />

      <main>
        <header className="pricing-head">
          <p className="kicker">Pricing</p>
          <SplitText
            key={aud}
            tag="h1"
            className="title"
            text={isTraveler ? 'One payment. The whole island.' : 'Business listings are coming.'}
            splitType="words"
            effect="rise"
            delay={50}
            duration={0.8}
            textAlign="center"
          />
          <p className="lede">
            {isTraveler
              ? 'Less than one Bio Bay tour. Less than half a day of jeep rental. Passes never renew.'
              : 'Not open yet — tell us where to reach you and you’ll be first in.'}
          </p>

          <div className="segmented" role="tablist" aria-label="Plans for" data-pos={isTraveler ? 0 : 1}>
            <span className="thumb" aria-hidden="true" />
            <button role="tab" aria-selected={isTraveler} onClick={() => setAud('traveler')}>Travelers</button>
            <button role="tab" aria-selected={!isTraveler} onClick={() => setAud('business')}>Businesses</button>
          </div>
        </header>

        {canceled && <p className="notice">Checkout canceled — no charge was made. You can try again below.</p>}
        {error && <p className="notice err" role="alert">{error}</p>}

        {isTraveler ? (
          <>
            {/* ---- Plan cards: the headline of each pass ---- */}
            <div className="plans-row">
              <div className="plans">
                {cols.map((p) => {
                  const isPicked = picked === p.key
                  const glow = isPicked || (!picked && p.featured)
                  const card = (
                    <SpotlightCard className="plan" spotlightColor="#64DBE8" intensity={0.1} borderGlow={0.6} style={CARD_STYLE}>
                      {isPicked
                        ? <span className="badge">Your pick</span>
                        : p.badge && <span className="badge">{p.badge}</span>}
                      <h3>{p.name}</h3>
                      <p className="sub">{p.tagline}</p>
                      <div className="price">{p.price}<small>{p.unit}</small></div>
                      <ul>
                        {(PLAN_HIGHLIGHTS[p.key] || []).map((f) => (
                          <li key={f}><CheckIcon width={16} height={16} />{f}</li>
                        ))}
                      </ul>
                      {planButton(p, 'btn-lg')}
                    </SpotlightCard>
                  )
                  return (
                    <div key={p.key} className={glow ? 'plan-shell featured' : 'plan-shell'}>
                      {glow ? (
                        <StarBorder as="div" className="plan-star" color="#64DBE8" radius={30} duration={6} thickness={1} hover="none" clickPulse={false} backgroundColor="transparent">
                          {card}
                        </StarBorder>
                      ) : card}
                    </div>
                  )
                })}
              </div>
              <p className="center" style={{ marginTop: 24 }}>
                <a href="#compare" className="link">Compare every feature</a>
              </p>
            </div>

            {/* ---- Full comparison: one table, plans side by side ---- */}
            <section id="compare" className="compare" aria-labelledby="compare-title">
              <div className="compare-head">
                <p className="kicker">Compare passes</p>
                <h2 id="compare-title" className="title" style={{ fontSize: 'clamp(28px,3.4vw,40px)' }}>Everything in each pass</h2>
              </div>

              <AnimatedContent className="ctable" distance={24} duration={0.6} role="table" aria-label="Feature comparison">
                <div className="ctable-top" role="row">
                  <span className="lab-spacer" role="columnheader" aria-label="Feature" />
                  {cols.map((p) => (
                    <div key={p.key} className={p.featured ? 'col feat' : 'col'} role="columnheader">
                      <b>{p.name}</b>
                      <span>{p.price}</span>
                    </div>
                  ))}
                </div>

                {SELLABLE_TRAVELER_FEATURE_GROUPS.map((g) => (
                  <div key={g.group} role="rowgroup">
                    {/* Group heading is a full grid row (with empty cells) so the
                        featured column's tint runs unbroken top to bottom. */}
                    <div className="ctable-row ctable-group-row" role="row">
                      <div className="ctable-group" role="rowheader">{g.group}</div>
                      {cols.map((p) => <div key={p.key} className={p.featured ? 'v feat-col' : 'v'} aria-hidden="true" />)}
                    </div>
                    {g.rows.map((row) => {
                      const allOff = cols.every((p) => row.values[p.key] === false || row.values[p.key] === null)
                      return (
                        <div key={row.label} className="ctable-row" role="row">
                          <div className={allOff ? 'lab off' : 'lab'} role="rowheader">
                            {row.label}
                            {row.hint && <small>{row.hint}</small>}
                          </div>
                          {cols.map((p) => (
                            <div key={p.key} className={p.featured ? 'v feat-col' : 'v'} role="cell">
                              <FeatureValue value={row.values[p.key]} />
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}

                <div className="ctable-row ctable-cta" role="row">
                  <span className="lab-spacer" />
                  {cols.map((p) => (
                    <div key={p.key} className={p.featured ? 'v feat-col' : 'v'} role="cell">
                      {planButton(p)}
                    </div>
                  ))}
                </div>
              </AnimatedContent>
            </section>

            {/* ---- Add-ons: iOS grouped list ---- */}
            <section className="addons" aria-labelledby="addons-title">
              <h3 id="addons-title">Add-ons</h3>
              <div className="group-list">
                {ADDONS.map((a) => (
                  <div key={a.key} className="group-row">
                    <div>
                      <b>{a.name}</b>
                      <span>{a.blurb}</span>
                    </div>
                    <button className="btn btn-ghost"
                      onClick={() => choose({ key: a.key, checkout: true })}
                      disabled={busy === a.key}>
                      {busy === a.key ? '…' : a.price}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <div className="pricing-fine">
              <p>
                Exploration includes 150 Ask AI messages per pass — enough that most travelers
                never think about it. Passes are one-time purchases, not subscriptions.
              </p>
              {!session && (
                <p>You’ll create an account before paying. <Link to="/login">Already have one?</Link></p>
              )}
              {/* Refund terms sit next to the buy buttons, not only in the
                  homepage footer — "what if my ferry is cancelled" is the
                  question people have on this page. */}
              <p>
                Trip fell through? Unused passes are refundable within 7 days — see our{' '}
                <Link to="/refunds">refund policy</Link>. By buying you agree to our{' '}
                <Link to="/terms">terms</Link> and <Link to="/privacy">privacy policy</Link>.
              </p>
            </div>
          </>
        ) : (
          <BusinessWaitlist />
        )}
        <div style={{ height: 96 }} />
      </main>
    </div>
  )
}
