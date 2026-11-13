import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import NavBar from './NavBar.jsx'
import SiteFooter from './SiteFooter.jsx'
import { pageMeta, COUNTS } from '../lib/guide.js'

// Frame for every Island guide page: nav, content, the one CTA band, footer.
//
// Deliberately NO Ink Field / WebGL / Phone3D here. These pages are read on a
// phone at the ferry dock and judged by Google on load speed; the homepage is
// where the show is. Same palette, type and capsule buttons, so they still
// feel like the same site.
export default function GuideLayout({ crumbs, children }) {
  useGuideHead()
  return (
    <>
      <NavBar />
      <main className="guide">
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map(([label, to], i) => (
              <span key={to}>
                {i > 0 && <span aria-hidden="true"> / </span>}
                {i < crumbs.length - 1 ? <Link to={to}>{label}</Link> : <span aria-current="page">{label}</span>}
              </span>
            ))}
          </nav>
        )}
        {children}
        <MapCta />
      </main>
      <SiteFooter />
    </>
  )
}

// The free sample ends here: one orange action, pointing at the plans.
// Copy says what the guide does NOT give — that's what people pay for.
function MapCta() {
  return (
    <section className="guide-cta">
      <p className="kicker">The full island, on one map</p>
      <h2 className="title">Directions, live weather and an AI that answers in pins.</h2>
      <p className="lede">
        Exact pins and routes to every beach, {COUNTS.snorkel_spots} snorkel spots,
        {' '}{COUNTS.restaurants} restaurants, {COUNTS.activities} activities and how to get around — plus Ask AI.
      </p>
      <a href="/#pricing" className="btn btn-primary btn-lg">See the map plans</a>
    </section>
  )
}

// Client-side half of per-page SEO: on in-app navigation, swap the title,
// description, canonical and og:url to this page's (the static HTML already
// has them for first loads), and restore the homepage's on the way out.
function useGuideHead() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = pageMeta(pathname)
    if (!meta) return
    const desc = document.querySelector('meta[name="description"]')
    const prev = { title: document.title, desc: desc?.getAttribute('content') }
    document.title = meta.title
    desc?.setAttribute('content', meta.description)
    return () => {
      document.title = prev.title
      if (prev.desc != null) desc?.setAttribute('content', prev.desc)
    }
  }, [pathname])
}
