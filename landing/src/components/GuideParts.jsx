import { Link } from 'react-router-dom'
import { ChevronIcon } from './icons.jsx'
import { TOPICS, TOPIC_PATHS } from '../lib/guide.js'
import { FACTS_CHECKED } from '../content/guide/topics.js'

// Building blocks shared by the cluster pages (/ferry, /getting-around,
// /bio-bay, /restaurants).

// The page's FAQ, rendered OPEN (h3 + p, not <details>): these answers are
// what we want quoted in Google's "People also ask" and AI overviews, and the
// same array is the page's FAQPage JSON-LD (lib/guide.js), so they match.
export function GuideFaq({ faq, id = 'faq' }) {
  return (
    <section className="guide-sec" aria-labelledby={id}>
      <h2 id={id} className="guide-h2">Questions people ask</h2>
      <div className="group-list guide-faq">
        {faq.map(({ q, a }) => (
          <div key={q} className="guide-qa">
            <h3>{q}</h3>
            <p>{a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// Cross-links to the other guides. Internal links are how Google finds and
// weighs every page, and how a ferry-page visitor ends up on restaurants.
export function RelatedGuides({ current }) {
  const items = [...TOPIC_PATHS.filter((p) => p !== current).map((p) => [p, TOPICS[p].nav, TOPICS[p].blurb]),
    ['/beaches', 'Beaches', 'All the beaches: calm or rough, access, tips']]
  return (
    <section className="guide-sec" aria-labelledby="g-more">
      <h2 id="g-more" className="guide-h2">More of the island guide</h2>
      <ul className="group-list guide-list">
        {items.map(([to, label, blurb]) => (
          <li key={to}>
            <Link to={to} className="guide-row">
              <span><b>{label}</b><span>{blurb}</span></span>
              <ChevronIcon />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// "Checked November 2026": a freshness signal for readers and Google on pages
// whose facts (fares, prices) change.
export function Checked() {
  return <p className="guide-checked">Facts checked {FACTS_CHECKED}.</p>
}

// Tap-to-call. Most of these pages are read on a phone on the island, where
// a phone number you can't tap is half an answer.
export function Phone({ n }) {
  return <a className="guide-tel" href={`tel:+1${n.replace(/\D/g, '')}`}>{n}</a>
}
