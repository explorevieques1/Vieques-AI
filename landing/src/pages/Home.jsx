import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import Phone3D from '../components/Phone3D.jsx'
import HeroTerrain from '../components/HeroTerrain.jsx'
import { PinIcon, CheckIcon, ChevronIcon } from '../components/icons.jsx'
import SplitText from '../components/reactbits/SplitText.jsx'
import AnimatedContent from '../components/reactbits/AnimatedContent.jsx'
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx'
import { LogoLoop } from '../components/reactbits/LogoLoop.jsx'
import StarBorder from '../components/reactbits/StarBorder.jsx'
import Magnet from '../components/reactbits/Magnet.jsx'
import { SELLABLE_TRAVELER_PLANS, PLAN_HIGHLIGHTS } from '../lib/plans.js'
import { moonPhase, bioBayVerdict } from '../lib/moon.js'
import { FAQ } from '../content/faq.js'
import InkField from '../components/ink/InkField.jsx'
import PlanSlide from '../components/PlanSlide.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import { getSession } from '../lib/supabase.js'
import { startCheckout } from '../lib/api.js'

// ---------------------------------------------------------------------------
//  Copy notes (SEO): every heading names a thing people search for — Vieques
//  map, beaches, snorkeling, Mosquito Bay, getting around, restaurants — in
//  plain words. Numbers are the real row counts in Supabase as of 2026-11-12
//  (17 beaches, 5 snorkel spots, 35 restaurants, 14 transport options). If
//  the data grows, update them here; don't round up.
// ---------------------------------------------------------------------------

// Real places from the beaches + snorkel_spots tables. Doubles as an
// on-page list of the long-tail names the SEO note says we should own.
const PLACES = [
  // [name, aka, guide slug] — the slug links the chip to its /beaches page.
  ['Sun Bay', 'Balneario Sombe', 'sun-bay'],
  ['Mosquito Bay', 'bio bay', null],
  ['La Chiva', 'Blue Beach', 'playa-la-chiva'],
  ['Playa Caracas', 'Red Beach', 'playa-caracas'],
  ['Punta Arenas', 'Green Beach', 'punta-arenas'],
  ['Playa Negra', 'black sand', 'playa-negra'],
  ['Media Luna', null, 'playa-media-luna'],
  ['Navio', null, 'playa-navio'],
  ['Playa La Plata', 'Orchid Beach', 'playa-la-plata'],
  ['Mosquito Pier', 'snorkeling', null],
  ['Esperanza', 'Malecón', 'playa-esperanza'],
  ['Playa Grande', null, 'playa-grande'],
]

// Every bento cell / pricing card is a React Bits SpotlightCard re-skinned
// to the Black Pearl surface: the turquoise light follows the pointer.
const CARD_STYLE = {
  '--spotlight-card-surface': '#0A202D',
  '--spotlight-card-border': 'rgba(143,169,180,.14)',
  '--spotlight-card-shadow': 'var(--card-glow)',
}
// Magnetic pull only makes sense with a hovering pointer; on touch it just
// leaves the button offset from where the finger expects it.
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

function Cell({ className = '', children }) {
  return (
    <SpotlightCard className={`cell ${className}`} spotlightColor="#64DBE8" intensity={0.12} spotlightSize={320} borderGlow={0.7} style={CARD_STYLE}>
      {children}
    </SpotlightCard>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [aud, setAud] = useState('traveler')
  const [session, setSession] = useState(null)
  const [picked, setPicked] = useState(
    () => (SELLABLE_TRAVELER_PLANS.find((p) => p.featured) || SELLABLE_TRAVELER_PLANS[0]).key,
  )
  const [payError, setPayError] = useState(null) // { key, msg }
  const pickedPlan = SELLABLE_TRAVELER_PLANS.find((p) => p.key === picked) || SELLABLE_TRAVELER_PLANS[0]

  useEffect(() => {
    getSession().then(({ data }) => setSession(data?.session || null)).catch(() => {})
  }, [])

  // Slide to pay (per card). Signed in → straight to Stripe Checkout.
  // Signed out → the existing signup flow with that pass pre-selected (a
  // purchase must belong to an account for the webhook to grant it), which
  // resumes at checkout. The promise never resolves on success — the page is
  // navigating away, so SlideCommit keeps its spinner instead of a fake "Paid".
  function payFor(plan) {
    setPicked(plan.key)
    setPayError(null)
    if (!plan.checkout || !session) {
      choosePlan(plan.key)
      return new Promise(() => {})
    }
    return new Promise((_, reject) => {
      startCheckout(plan.key, session).catch((e) => {
        setPayError({ key: plan.key, msg: e.message || 'Could not start checkout. Please try again.' })
        reject(e)
      })
    })
  }

  // Arrow keys move the selection inside the pass radiogroup.
  function onPlanKey(e) {
    const keys = SELLABLE_TRAVELER_PLANS.map((p) => p.key)
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const next = keys[(keys.indexOf(picked) + step + keys.length) % keys.length]
    setPicked(next)
    e.currentTarget.querySelector(`[data-plan="${next}"] .plan-check`)?.focus()
  }

  // Remember the chosen plan and send the user to signup; checkout resumes
  // with this plan after the account exists.
  function choosePlan(plan) {
    try { sessionStorage.setItem('vq_plan', plan) } catch (_) {}
    navigate('/signup?plan=' + encodeURIComponent(plan))
  }

  const placeItems = useMemo(
    () => PLACES.map(([name, aka, slug]) => {
      const chip = <><PinIcon width={16} height={16} />{name}{aka && <em>{aka}</em>}</>
      return {
        title: name,
        // A same-tab router Link, not LogoLoop's own href (that opens a new
        // tab). tabIndex -1: the marquee repeats every item, and keyboard
        // users reach the same pages through the footer and nav instead.
        node: slug
          ? <Link to={`/beaches/${slug}`} className="place-chip" tabIndex={-1}>{chip}</Link>
          : <span className="place-chip">{chip}</span>,
      }
    }),
    [],
  )

  return (
    <>
      <NavBar />

      <main>
        {/* ================= HERO ================= */}
        <header id="top" className="hero">
          <HeroTerrain />
          <div className="hero-grid">
            <div>
              <p className="hero-place">Vieques, Puerto Rico</p>
              <SplitText
                tag="h1"
                text="Every beach in Vieques, on one map that answers back."
                splitType="words"
                effect="rise"
                delay={60}
                duration={1}
                textAlign="left"
              />
              <p className="lede">
                The interactive Vieques travel guide: all 17 beaches, the best snorkeling spots,
                Mosquito Bay timing, 35 restaurants and how to get around — with an AI guide that
                answers by dropping pins on the map.
              </p>
              <div className="hero-cta">
                <Magnet padding={60} magnetStrength={4} disabled={!FINE_POINTER}>
                  <Link to="/signup" className="btn btn-primary btn-lg">Start exploring</Link>
                </Magnet>
                <a href="#map" className="link">See what’s on the map</a>
              </div>
            </div>

            <Phone3D />
          </div>
        </header>

        {/* ================= PLACES MARQUEE ================= */}
        <section className="places" aria-label="Beaches and snorkel spots on the map">
          <LogoLoop
            logos={placeItems}
            speed={42}
            gap={44}
            logoHeight={24}
            pauseOnHover
            fadeOut
            fadeOutWidth={0.08}
            draggable={false}
            ariaLabel="Vieques beaches and snorkel spots on the map"
          />
        </section>

        {/* ================= INK FIELD (bento → final CTA) =================
            A fixed WebGL layer behind this content: Vieques engravings condense
            out of flowing ink and morph into each other as the reader scrolls.
            Sections tagged data-ink-scene anchor each image. components/ink/. */}
        <InkField>
        {/* ================= BENTO: WHAT'S ON THE MAP ================= */}
        <section id="map" data-ink-scene="roots" className="section" style={{ paddingTop: 'clamp(48px,6vw,72px)' }}>
          <div className="wrap">
            <p className="kicker">What’s on the map</p>
            <h2 className="title">The Vieques map, built by people who live here.</h2>
            <p className="lede">
              Beaches, snorkel zones, restaurants, transport and island essentials — pinned, sorted and
              checked on the ground.
            </p>

            <AnimatedContent className="bento" distance={40} duration={0.7} stagger={0.07} threshold={0.15}>
              <div className="b-ai">
                <Cell>
                  <h3>Ask in plain words. Get answers as pins.</h3>
                  <p>
                    Ask where to rent a jeep, which beach is calmest for kids or where to eat in Esperanza.
                    The AI guide searches the map’s own listings and pins what it finds — no guessing.
                  </p>
                  <div className="thread art" aria-label="Example conversation">
                    <div className="bubble me">Where can I rent a jeep near the ferry?</div>
                    <div className="bubble ai">
                      There are rental spots a short walk from the ferry in Isabel Segunda. I’ve pinned them
                      on your map, with directions from the dock.
                      <div className="pins">
                        <span className="pin-chip"><PinIcon width={14} height={14} />Car rentals near the ferry</span>
                        <span className="pin-chip">Get directions</span>
                      </div>
                    </div>
                    <div className="bubble me">And a calm beach after?</div>
                    <div className="bubble ai typing" aria-label="AI is typing"><i /><i /><i /></div>
                  </div>
                </Cell>
              </div>

              <div className="b-snork">
                <Cell>
                  <h3>Vieques snorkeling zones, drawn on the water</h3>
                  <p>
                    Five snorkel spots — Mosquito Pier, Esperanza, La Chiva, Caracas and Punta Arenas — with
                    zones showing where to enter, where to swim and where to stay out.
                  </p>
                  <SnorkelArt />
                </Cell>
              </div>

              <div className="b-moon"><MoonCell /></div>

              <div className="b-route">
                <Cell>
                  <h3>Real driving routes</h3>
                  <p>Turn-by-turn directions, plus which beaches need a 4×4.</p>
                  <RouteArt />
                </Cell>
              </div>

              <div className="b-eat">
                <Cell>
                  <h3>35 Vieques restaurants</h3>
                  <p>Hours, price range and contact for each, from Isabel Segunda to Esperanza.</p>
                  <div className="chips art">
                    {['Seafood', 'Local', 'Waterfront', 'Breakfast'].map((c) => <span key={c} className="chip">{c}</span>)}
                  </div>
                </Cell>
              </div>

              <div className="b-move">
                <Cell>
                  <h3>Getting around Vieques</h3>
                  <p>Ferry, airlines, water taxis, públicos and rentals: 14 ways on and around the island.</p>
                  <div className="chips art">
                    {['Ferry', 'Taxis & Públicos', 'Golf cart & UTV'].map((c) => <span key={c} className="chip">{c}</span>)}
                  </div>
                </Cell>
              </div>

              <div className="b-filt">
                <Cell>
                  <h3>Filters that know the island</h3>
                  <p>Narrow beaches by calm water, snorkeling or family-friendly; find activities from kayaking to stargazing.</p>
                  <FilterChips />
                </Cell>
              </div>
            </AnimatedContent>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section id="how" className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <p className="kicker">How it works</p>
            <h2 className="title">Plan your Vieques trip in three steps.</h2>
            <AnimatedContent className="steps" distance={30} duration={0.6} stagger={0.1}>
              <div className="step">
                <span className="step-n">Step 1</span>
                <h3>Pick a pass</h3>
                <p>One payment for 24 hours, 7 days or 30 days. No subscription, nothing to install.</p>
              </div>
              <div className="step">
                <span className="step-n">Step 2</span>
                <h3>Open the map</h3>
                <p>Every beach, restaurant and service on the island is already pinned. Filter, or just ask.</p>
              </div>
              <div className="step">
                <span className="step-n">Step 3</span>
                <h3>Go</h3>
                <p>Driving routes, travel times and one tap to Google Maps — even from a beach with one bar of signal.</p>
              </div>
            </AnimatedContent>
          </div>
        </section>

        {/* ================= PRICING ================= */}
        <section id="pricing" data-ink-scene="lighthouse" className="section" style={{ paddingTop: 0 }}>
          <div className="wrap center">
            <p className="kicker">Pricing</p>
            <h2 className="title">One payment. The whole island.</h2>
            <p className="lede">Choose how long you’re on Vieques. Every pass is a one-time payment that never renews.</p>

            <div className="segmented" role="tablist" aria-label="Plans for" data-pos={aud === 'business' ? 1 : 0}>
              <span className="thumb" aria-hidden="true" />
              <button role="tab" aria-selected={aud === 'traveler'} onClick={() => setAud('traveler')}>Travelers</button>
              <button role="tab" aria-selected={aud === 'business'} onClick={() => setAud('business')}>Businesses</button>
            </div>
          </div>

          <div
            className={aud === 'traveler' ? 'plans' : 'plans hidden'}
            role="radiogroup"
            aria-label="Choose your pass"
            onKeyDown={onPlanKey}
          >
            {SELLABLE_TRAVELER_PLANS.map((p) => {
              const on = p.key === picked
              const card = (
                <SpotlightCard className="plan" spotlightColor="#64DBE8" intensity={0.1} borderGlow={0.6} style={CARD_STYLE}>
                  <button
                    type="button"
                    className="plan-check"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Select ${p.name}, ${p.price} ${p.unit}`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setPicked(p.key)}
                  >
                    <CheckIcon width={16} height={16} aria-hidden="true" />
                  </button>
                  <div className="plan-head">
                    <h3>{p.name}</h3>
                    {p.badge && <span className="badge">{p.badge}</span>}
                  </div>
                  <p className="sub">{p.tagline}</p>
                  <div className="price">{p.price}<small>{p.unit}</small></div>
                  <ul>
                    {(PLAN_HIGHLIGHTS[p.key] || []).map((f) => (
                      <li key={f}><CheckIcon width={16} height={16} />{f}</li>
                    ))}
                  </ul>
                  <PlanSlide
                    picked={on}
                    label={session ? `Slide to pay ${p.price}` : `Slide to get ${p.name}`}
                    onConfirm={() => payFor(p)}
                  />
                  {payError?.key === p.key && <p className="plan-error" role="alert">{payError.msg}</p>}
                </SpotlightCard>
              )
              return (
                <div
                  key={p.key}
                  data-plan={p.key}
                  className={`plan-shell${p.featured ? ' featured' : ''}${on ? ' picked' : ''}`}
                  onClick={() => setPicked(p.key)}
                >
                  {p.featured ? (
                    <StarBorder as="div" className="plan-star" color="#64DBE8" radius={30} duration={6} thickness={1} hover="none" clickPulse={false} backgroundColor="transparent">
                      {card}
                    </StarBorder>
                  ) : card}
                </div>
              )
            })}
          </div>

          {/* BUSINESS — not for sale yet; see the long note in lib/plans.js. */}
          <div className={aud === 'business' ? 'plans' : 'plans hidden'}>
            <div className="plan-shell" style={{ gridColumn: '1 / -1', maxWidth: 560, margin: '0 auto' }}>
              <SpotlightCard className="plan" spotlightColor="#64DBE8" intensity={0.1} style={CARD_STYLE}>
                <h3>Coming soon for Vieques businesses</h3>
                <p className="sub">Claim your listing, keep it current and see who found you.</p>
                <ul>
                  {['Claim and edit your own listing', 'Photos, hours, menu and booking links', 'A verified badge travelers trust', 'See views and taps for directions'].map((f) => (
                    <li key={f}><CheckIcon width={16} height={16} />{f}</li>
                  ))}
                </ul>
                <Link to="/pricing?for=business" className="btn btn-ghost btn-lg">Join the waitlist</Link>
              </SpotlightCard>
            </div>
          </div>

          <p className="center" style={{ marginTop: 28 }}>
            <Link to={aud === 'business' ? '/pricing?for=business' : '/pricing#compare'} className="link">
              {aud === 'business' ? 'See what we’re building' : 'Compare every feature'}
            </Link>
          </p>
        </section>

        {/* ================= FAQ ================= */}
        <section id="faq" data-ink-scene="mill" className="section" style={{ paddingTop: 0 }}>
          <div className="wrap center">
            <p className="kicker">Vieques travel questions</p>
            <h2 className="title">Before you go</h2>
          </div>
          <div className="faq">
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<ChevronIcon /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ================= FINAL CTA ================= */}
        <section className="final">
          <h2 className="title">Land on Vieques knowing where to go.</h2>
          <Magnet padding={60} magnetStrength={4} disabled={!FINE_POINTER}>
            <Link to="/signup" className="btn btn-primary btn-lg">Start exploring</Link>
          </Magnet>
        </section>
        </InkField>
      </main>

      <SiteFooter />
    </>
  )
}

/* ---------------- bento art ---------------- */

// Tonight's real moon phase — the one thing that decides a bio bay night.
function MoonCell() {
  const { name, illumination, fraction } = moonPhase()
  const pct = Math.round(illumination * 100)
  const verdict = bioBayVerdict()
  // Shadow disc offset: waxing lights from the right, waning from the left.
  const waxing = fraction < 0.5
  const shift = (waxing ? -1 : 1) * illumination * 2 * 26
  return (
    <Cell>
      <h3>Mosquito Bay, timed right</h3>
      <div className="moon-row">
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <defs><clipPath id="moonclip"><circle cx="26" cy="26" r="24" /></clipPath></defs>
          <circle cx="26" cy="26" r="24" fill="#EAF5F7" />
          <circle cx={26 + shift} cy="26" r="24" fill="#112C3B" clipPath="url(#moonclip)" opacity={illumination > 0.98 ? 0 : 1} />
        </svg>
        <div>
          <strong>{pct}%</strong>
          <span>{name} tonight</span>
        </div>
      </div>
      <p>The bio bay glows brightest on dark, moonless nights.</p>
      {verdict && <span className={verdict.good ? 'verdict good' : 'verdict'}>{verdict.label}</span>}
    </Cell>
  )
}

function SnorkelArt() {
  return (
    <svg className="art" viewBox="0 0 240 170" width="100%" role="img" aria-label="Illustration of snorkel zones off a beach">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8FA9B4" strokeWidth="1.5" opacity=".45" />
        </pattern>
      </defs>
      {/* shoreline */}
      <path d="M0 26 C40 18 70 40 110 30 S190 8 240 22 L240 0 L0 0Z" fill="#112C3B" />
      {/* recommended zone */}
      <path d="M52 52 C80 40 132 44 150 64 C166 84 140 112 104 110 C70 108 40 84 52 52Z" fill="rgba(100,219,232,.14)" stroke="#64DBE8" strokeWidth="1.5" />
      {/* stay-out zone (boat channel) */}
      <path d="M168 70 C196 60 232 76 236 104 C238 128 206 140 182 128 C164 118 156 84 168 70Z" fill="url(#hatch)" stroke="#8FA9B4" strokeDasharray="4 4" />
      {/* entry point */}
      <circle cx="80" cy="36" r="5" fill="#64DBE8" />
      <text x="90" y="80" fill="#64DBE8" fontSize="11" fontWeight="600">Swim here</text>
      <text x="176" y="154" fill="#8FA9B4" fontSize="11" fontWeight="600">Stay out</text>
    </svg>
  )
}

function RouteArt() {
  return (
    <svg className="art" viewBox="0 0 240 70" width="100%" role="img" aria-label="Illustration of a driving route between two pins">
      <path d="M16 52 C60 52 70 18 120 22 S190 54 224 20" fill="none" stroke="#64DBE8" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
      <circle cx="16" cy="52" r="6" fill="#04141E" stroke="#64DBE8" strokeWidth="2.5" />
      <circle cx="224" cy="20" r="6" fill="#64DBE8" />
    </svg>
  )
}

// A small working filter — tapping a chip toggles it, like in the app.
function FilterChips() {
  const all = ['Calm water', 'Snorkeling', 'Family-friendly', 'Kayaking', 'Bio Bay', 'Hiking', 'Sunsets', 'Stargazing']
  const [on, setOn] = useState(['Calm water', 'Snorkeling'])
  const toggle = (c) => setOn((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))
  return (
    <div className="chips art" role="group" aria-label="Example filters">
      {all.map((c) => (
        <button
          key={c}
          type="button"
          className={on.includes(c) ? 'chip on' : 'chip'}
          aria-pressed={on.includes(c)}
          onClick={() => toggle(c)}
          style={{ border: 0, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 600 }}
        >
          {c}
        </button>
      ))}
    </div>
  )
}
