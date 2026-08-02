import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar.jsx'
import IOSPhoneFrame from '../components/IOSPhoneFrame.jsx'

export default function Home() {
  const navigate = useNavigate()
  const [aud, setAud] = useState('traveler') // pricing audience toggle

  // When a plan is chosen, remember it and send the user to signup.
  // After signup we resume checkout with this plan.
  function choosePlan(plan) {
    try { sessionStorage.setItem('vq_plan', plan) } catch (_) {}
    navigate('/signup?plan=' + encodeURIComponent(plan))
  }

  // Scroll reveal: add .in to .reveal elements as they enter the viewport.
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window) || !els.length) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      {/* ================= NAV ================= */}
      <NavBar />

      {/* ================= HERO ================= */}
      <header id="top" className="hero">
        <svg className="topo" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g transform="rotate(-8 170 160)">
            <ellipse cx="170" cy="160" rx="70"  ry="42"  fill="none" stroke="rgba(103,232,249,.10)"/>
            <ellipse cx="176" cy="166" rx="125" ry="80"  fill="none" stroke="rgba(103,232,249,.085)"/>
            <ellipse cx="168" cy="158" rx="185" ry="124" fill="none" stroke="rgba(103,232,249,.07)"/>
            <ellipse cx="180" cy="170" rx="250" ry="172" fill="none" stroke="rgba(103,232,249,.055)"/>
            <ellipse cx="172" cy="162" rx="320" ry="225" fill="none" stroke="rgba(103,232,249,.04)"/>
          </g>
          <g transform="rotate(6 1030 560)">
            <ellipse cx="1030" cy="560" rx="60"  ry="38"  fill="none" stroke="rgba(103,232,249,.10)"/>
            <ellipse cx="1024" cy="554" rx="112" ry="74"  fill="none" stroke="rgba(103,232,249,.08)"/>
            <ellipse cx="1034" cy="564" rx="170" ry="116" fill="none" stroke="rgba(103,232,249,.06)"/>
            <ellipse cx="1026" cy="556" rx="235" ry="164" fill="none" stroke="rgba(103,232,249,.045)"/>
          </g>
        </svg>

        <div className="hero-grid">
          <div>
            <span className="eyebrow"><i className="dot"></i> Live on Vieques Island, Puerto Rico</span>
            <h1>Explore Vieques with an <em>AI island guide</em> in your pocket.</h1>
            <p className="lede">An interactive map of the whole island — beaches, restaurants, activities, stays, and essentials — with an AI that answers your questions and drops the answers right on the map.</p>
            <div className="hero-cta">
              <Link to="/signup" className="btn btn-primary btn-lg">Start Exploring</Link>
              <a href="#features" className="btn btn-ghost btn-lg">See Features</a>
            </div>
          </div>

          {/* phone mockup: real iPhone bezel wrapping a real device screenshot.
              The capture is 1170x2532 (iPhone 15, 9:19.5) — the same aspect the
              frame locks to — so it fills the glass with nothing cropped. */}
          <div className="phone-wrap">
            <IOSPhoneFrame width={272} theme="dark" screenshot>
              <img
                className="phone-shot"
                src="/app-screenshot.jpg"
                alt="The Vieques AI map on iPhone, showing beach pins across the island and a blue dot marking the viewer's live location"
                width={1170}
                height={2532}
              />
            </IOSPhoneFrame>
          </div>
        </div>
      </header>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="section">
        <div className="steps">
          <div className="step reveal"><div className="step-n">1</div><h3>Open the map</h3><p>Every beach, restaurant, and service on the island, already pinned.</p></div>
          <div className="step reveal"><div className="step-n">2</div><h3>Ask or explore</h3><p>Filter by what you want, or just ask the AI in plain language.</p></div>
          <div className="step reveal"><div className="step-n">3</div><h3>Go</h3><p>Real driving routes and travel times, one tap to Google Maps.</p></div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="section section-alt">
        <div className="feature-lead center reveal">
          <span className="eyebrow">Features</span>
          <h2>The whole island, one map</h2>
          <p className="lede" style={{ margin: '0 auto' }}>Built from the ground up for Vieques — not a generic travel app with three pins on it.</p>
        </div>

        <div className="cards">
          <div className="card card-wide reveal">
            <div className="ico">🗺️</div>
            <h3>Interactive Island Map</h3>
            <p>Browse categorized pins across all of Vieques — beaches, restaurants, activities, stays, services, transportation, and essentials. Custom emoji markers make every category instantly scannable, in street or satellite view.</p>
            <div className="tags">
              <span className="tag">🏖️ Beaches</span><span className="tag">🍽️ Restaurants</span><span className="tag">🏄 Activities</span>
              <span className="tag">🏡 Stays</span><span className="tag">🛻 Transport</span><span className="tag">🧾 Essentials</span>
            </div>
          </div>

          <div className="card card-wide reveal" style={{ borderColor: 'rgba(6,182,212,.35)' }}>
            <span className="eyebrow" style={{ marginBottom: '12px' }}>✦ Flagship feature</span>
            <h3 style={{ fontSize: '24px' }}>Ask AI. Answers become pins.</h3>
            <p>Ask anything in plain language — “where do I rent a car?”, “find me a quiet beach” — and the assistant answers instantly, dropping the results straight onto the map. No searching, no tabs, no guesswork.</p>
            <div className="chat" style={{ margin: '18px 0 0', animation: 'none' }}>
              <q>Where do I rent a car?</q>
              <p>There are 4 rental spots near the ferry in Isabel II — most rent jeeps and side-by-sides. I've pinned them all. 🛻</p>
              <div className="tags"><span className="tag">📍 4 pins on map</span><span className="tag">Get directions</span></div>
            </div>
            <div style={{ marginTop: '18px' }}><Link to="/signup" className="btn btn-primary">Try Ask AI</Link></div>
          </div>

          <div className="card reveal">
            <div className="ico">🎯</div><h3>Smart Filters</h3>
            <p>Beaches by calm water, family-friendly, or snorkeling. Restaurants by Italian, seafood, or vegan. Services and essentials by type.</p>
            <div className="tags"><span className="tag">Calm water</span><span className="tag">Snorkeling</span><span className="tag">Seafood</span><span className="tag">Vegan</span></div>
          </div>

          <div className="card reveal">
            <div className="ico">🤿</div><h3>Snorkeling Zones</h3>
            <p>Hand-mapped zones drawn on the water: exactly where to go, where to avoid, and where turtles and rays hang out. Nobody else has this.</p>
            <div className="tags"><span className="tag">🐢 Turtles</span><span className="tag" style={{ borderColor: 'rgba(220,38,38,.5)', color: '#fca5a5' }}>avoid</span></div>
          </div>

          <div className="card reveal">
            <div className="ico">🧭</div><h3>Directions &amp; Routing</h3>
            <p>Real driving routes and travel times between any two places on the island, with one-tap “Open in Google Maps.”</p>
            <div className="tags"><span className="tag">🚗 14 min</span></div>
          </div>

          <div className="card reveal">
            <div className="ico">🍽️</div><h3>Restaurant Profiles</h3>
            <p>Rich detail cards for every restaurant — cuisine, price range, hours, and directions — like Google Maps, but complete for Vieques.</p>
            <div className="tags"><span className="tag">El Blok Kitchen</span><span className="tag" style={{ color: '#86efac', borderColor: 'rgba(34,197,94,.4)' }}>Open now</span></div>
          </div>
        </div>
      </section>

      {/* ================= TRUST ================= */}
      <section className="section">
        <div className="trust">
          <div className="reveal"><h3>Built by locals</h3><p>Every pin verified by people who live here.</p></div>
          <div className="reveal"><h3>Covers the whole island</h3><p>From Isabel II to Esperanza to the far east beaches.</p></div>
          <div className="reveal"><h3>Works on any phone</h3><p>Nothing to install — open it in your browser and go.</p></div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="section section-alt">
        <div className="feature-lead center reveal">
          <span className="eyebrow">Pricing</span>
          <h2>Simple pricing for your trip — or your business</h2>
          <p className="lede" style={{ margin: '0 auto' }}>Visiting the island, or running a business on it? Either way, there's a plan.</p>
        </div>

        <div className="center">
          <div className="toggle" role="tablist">
            <button className={aud==='traveler'?'on':''} onClick={() => setAud('traveler')} role="tab">For Travelers</button>
            <button className={aud==='business'?'on':''} onClick={() => setAud('business')} role="tab">For Businesses</button>
          </div>
        </div>

        {/* TRAVELER — headline tiers only. The full feature matrix lives on
            /pricing; this section is a teaser, so it stays to three cards. */}
        <div className={aud==='traveler'?'plans':'plans hidden'}>
          <div className="plan">
            <h3>Day Trip</h3><p className="sub">Off the ferry and back by dark</p>
            <div className="price">$6.99<small>one-time · 48 hours</small></div>
            <ul>
              <li>Full beach &amp; restaurant profiles</li><li>Directions &amp; road conditions</li>
              <li>Essentials and transport</li><li>Smart filters &amp; search</li>
            </ul>
            <button className="btn btn-ghost btn-lg" onClick={() => choosePlan('day_trip')}>Get Day Trip</button>
          </div>
          <div className="plan featured">
            <span className="badge">Most popular</span>
            <h3>Vacation</h3><p className="sub">Everything you need for your stay</p>
            <div className="price">$12.99<small>one-time · 7 days</small></div>
            <ul>
              <li>Everything in Day Trip</li><li>25 Ask AI messages</li>
              <li>All snorkeling zones &amp; spot detail</li><li>Bio Bay moon-phase guide</li>
            </ul>
            <button className="btn btn-primary btn-lg" onClick={() => choosePlan('vacation')}>Get Vacation</button>
          </div>
          <div className="plan">
            <h3>Exploration</h3><p className="sub">Long stays and repeat visitors</p>
            <div className="price">$24.99<small>one-time · 30 days</small></div>
            <ul>
              <li>Everything in Vacation</li><li>150 Ask AI messages</li>
              <li>Multi-day itinerary builder</li><li>Offline map pack</li>
            </ul>
            <button className="btn btn-ghost btn-lg" onClick={() => choosePlan('exploration')}>Get Exploration</button>
          </div>
        </div>

        {/* BUSINESS */}
        <div className={aud==='business'?'plans':'plans hidden'}>
          <div className="plan">
            <h3>Basic</h3><p className="sub">Kiosks, food trucks, small operators</p>
            <div className="price">$19<small>/month · $190/yr</small></div>
            <ul>
              <li>Your pin on the island map</li><li>Full profile: hours, prices, contact</li>
              <li>Appears in filters &amp; search</li><li>Update your listing anytime</li>
            </ul>
            <button className="btn btn-ghost btn-lg" onClick={() => choosePlan('business_basic')}>List My Business</button>
          </div>
          <div className="plan featured">
            <span className="badge">Recommended</span>
            <h3>Featured</h3><p className="sub">Restaurants, dive shops, tour operators</p>
            <div className="price">$59<small>/month · $590/yr</small></div>
            <ul>
              <li>Everything in Basic</li><li>Featured badge &amp; custom marker</li>
              <li>Monthly category spotlight</li><li>Engagement analytics</li>
            </ul>
            <button className="btn btn-primary btn-lg" onClick={() => choosePlan('business_featured')}>Get Featured</button>
          </div>
          <div className="plan">
            <h3>Island Partner</h3><p className="sub">Hotels and multi-location operators</p>
            <div className="price">$149<small>/month · $1,490/yr</small></div>
            <ul>
              <li>Everything in Featured</li><li>Up to 5 locations</li>
              <li>Homepage placement</li><li>Search-term data &amp; quarterly report</li>
            </ul>
            <button className="btn btn-ghost btn-lg" onClick={() => choosePlan('business_partner')}>Become a Partner</button>
          </div>
        </div>

        <p className="center" style={{ marginTop: 22 }}>
          <Link to="/pricing" className="link">Compare every feature →</Link>
        </p>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="final">
        <h2>Your island guide is waiting.</h2>
        <p className="lede" style={{ margin: '0 auto 26px' }}>Land on Vieques knowing exactly where to swim, eat, and explore.</p>
        <Link to="/signup" className="btn btn-primary btn-lg">Start Exploring</Link>
      </section>

      <footer className="footer">
        <span className="brand" style={{ fontSize: '16px' }}>Vieques<span> AI</span></span>
        <nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#pricing">For Businesses</a><a href="mailto:hello@explorevieques.org">Contact</a></nav>
        <span>© 2026 Vieques AI · Made on the island 🇵🇷</span>
      </footer>
    </>
  )
}