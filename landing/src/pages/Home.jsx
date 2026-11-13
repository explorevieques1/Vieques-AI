import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import Phone3D from '../components/Phone3D.jsx'
import HeroTerrain from '../components/HeroTerrain.jsx'
import { PinIcon, CheckIcon, ChevronIcon } from '../components/icons.jsx'
import SplitText from '../components/reactbits/SplitText.jsx'
import ScrollReveal from '../components/reactbits/ScrollReveal.jsx'
import AnimatedContent from '../components/reactbits/AnimatedContent.jsx'
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx'
import { LogoLoop } from '../components/reactbits/LogoLoop.jsx'
import StarBorder from '../components/reactbits/StarBorder.jsx'
import Magnet from '../components/reactbits/Magnet.jsx'
import { SELLABLE_TRAVELER_PLANS, PLAN_HIGHLIGHTS } from '../lib/plans.js'
import { moonPhase, bioBayVerdict } from '../lib/moon.js'
import { FAQ } from '../content/faq.js'

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
  ['Sun Bay', 'Balneario Sombe'],
  ['Mosquito Bay', 'bio bay'],
  ['La Chiva', 'Blue Beach'],
  ['Playa Caracas', 'Red Beach'],
  ['Punta Arenas', 'Green Beach'],
  ['Playa Negra', 'black sand'],
  ['Media Luna', null],
  ['Navio', null],
  ['Playa La Plata', 'Orchid Beach'],
  ['Mosquito Pier', 'snorkeling'],
  ['Esperanza', 'Malecón'],
  ['Playa Grande', null],
]

// Every bento cell / pricing card is a React Bits SpotlightCard re-skinned
// to the Black Pearl surface: the turquoise light follows the pointer.
const CARD_STYLE = {
  '--spotlight-card-surface': '#0A202D',
  '--spotlight-card-border': 'rgba(143,169,180,.14)',
  '--spotlight-card-shadow': 'none',
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

  // Remember the chosen plan and send the user to signup; checkout resumes
  // with this plan after the account exists.
  function choosePlan(plan) {
    try { sessionStorage.setItem('vq_plan', plan) } catch (_) {}
    navigate('/signup?plan=' + encodeURIComponent(plan))
  }

  const placeItems = useMemo(
    () => PLACES.map(([name, aka]) => ({
      title: name,
      node: (
        <span className="place-chip">
          <PinIcon width={16} height={16} />
          {name}{aka && <em>{aka}</em>}
        </span>
      ),
    })),
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

        {/* ================= MANIFESTO ================= */}
        <section className="section">
          <div className="manifesto">
            <ScrollReveal as="p" baseOpacity={0.12} enableBlur blurStrength={6} baseRotation={0} stagger={0.04}>
              Vieques has patchy signal, few street signs and roads that turn to dirt without warning.
              It also has seventeen beaches worth the drive, a bay that glows at night and wild horses
              along the way. We put all of it on one map.
            </ScrollReveal>
          </div>
        </section>

        {/* ================= BENTO: WHAT'S ON THE MAP ================= */}
        <section id="map" className="section" style={{ paddingTop: 0 }}>
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
        <section id="pricing" className="section" style={{ paddingTop: 0 }}>
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

          <div className={aud === 'traveler' ? 'plans' : 'plans hidden'}>
            {SELLABLE_TRAVELER_PLANS.map((p) => {
              const card = (
                <SpotlightCard className="plan" spotlightColor="#64DBE8" intensity={0.1} borderGlow={0.6} style={CARD_STYLE}>
                  {p.badge && <span className="badge">{p.badge}</span>}
                  <h3>{p.name}</h3>
                  <p className="sub">{p.tagline}</p>
                  <div className="price">{p.price}<small>{p.unit}</small></div>
                  <ul>
                    {(PLAN_HIGHLIGHTS[p.key] || []).map((f) => (
                      <li key={f}><CheckIcon width={16} height={16} />{f}</li>
                    ))}
                  </ul>
                  <button
                    className={p.featured ? 'btn btn-primary btn-lg' : 'btn btn-ghost btn-lg'}
                    onClick={() => choosePlan(p.key)}
                  >
                    {p.cta}
                  </button>
                </SpotlightCard>
              )
              return (
                <div key={p.key} className={p.featured ? 'plan-shell featured' : 'plan-shell'}>
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
        <section id="faq" className="section" style={{ paddingTop: 0 }}>
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
      </main>

      {/* Legal links are Link, not <a href>, so they route client-side. They
          sit in the footer because that is where Stripe looks for them. */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <h4>Explore Vieques</h4>
            <p style={{ margin: 0, maxWidth: '28em' }}>
              The interactive map and AI travel guide for Vieques, Puerto Rico. Made on the island.
            </p>
          </div>
          <nav aria-label="Island guide">
            <h4>The island</h4>
            <ul>
              <li><a href="#map">Vieques beaches map</a></li>
              <li><a href="#map">Snorkeling spots</a></li>
              <li><a href="#faq">Mosquito Bay timing</a></li>
              <li><a href="#faq">Getting to Vieques</a></li>
            </ul>
          </nav>
          <nav aria-label="Product">
            <h4>Explore Vieques</h4>
            <ul>
              <li><a href="#pricing">Pricing</a></li>
              <li><Link to="/pricing?for=business">For businesses</Link></li>
              <li><Link to="/login">Sign in</Link></li>
              <li><a href="mailto:hello@explorevieques.org">Contact</a></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h4>Legal</h4>
            <ul>
              <li><Link to="/terms">Terms</Link></li>
              <li><Link to="/privacy">Privacy</Link></li>
              <li><Link to="/refunds">Refunds</Link></li>
            </ul>
          </nav>
        </div>
        <div className="footer-base">
          <span>© 2026 Explore Vieques</span>
          <span>Vieques, Puerto Rico</span>
        </div>
      </footer>
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
