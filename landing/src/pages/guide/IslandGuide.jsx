import { Link } from 'react-router-dom'
import GuideLayout from '../../components/GuideLayout.jsx'
import { ChevronIcon } from '../../components/icons.jsx'
import { BEACHES, COUNTS } from '../../lib/guide.js'

// /guide — the hub the nav's "Island guide" link opens. Topics with a free
// guide page link to it; the rest are named honestly as "in the map app"
// rather than shown as "coming soon" stubs (thin pages hurt rankings).
export default function IslandGuide() {
  return (
    <GuideLayout>
      <header className="guide-head">
        <p className="kicker">Island guide</p>
        <h1 className="title">Vieques, from someone who lived there.</h1>
        <p className="lede">
          Six years on the island, written down: which beach to pick, how to reach it, and what to know before you go.
        </p>
      </header>

      <section className="guide-sec" aria-labelledby="g-free">
        <h2 id="g-free" className="guide-h2">Free guides</h2>
        <div className="group-list">
          {/* Trip order: get there, get around, the big night, eat, beaches. */}
          {[
            ['/ferry', 'Getting to Vieques', 'Ferry from Ceiba: fare, tickets, parking. Flights from San Juan'],
            ['/getting-around', 'Getting around', 'Car, jeep and golf cart rentals, taxis and públicos, with numbers'],
            ['/bio-bay', 'Bio Bay (Mosquito Bay)', 'The best nights by date for the next 12 months, and the tours'],
            ['/restaurants', 'Restaurants', `All ${COUNTS.restaurants}, by town: Esperanza and Isabel Segunda`],
            ['/beaches', 'Beaches', `All ${BEACHES.length}: calm or rough, how to get there, local tips`],
          ].map(([to, label, blurb]) => (
            <Link key={to} to={to} className="guide-row">
              <span><b>{label}</b><span>{blurb}</span></span>
              <ChevronIcon />
            </Link>
          ))}
        </div>
      </section>

      <section className="guide-sec" aria-labelledby="g-app">
        <h2 id="g-app" className="guide-h2">Also on the map</h2>
        <ul className="group-list guide-plain">
          {/* Each line describes data that exists in Supabase. Don't promise
              a feature the app lacks. */}
          <li className="guide-row"><span><b>{COUNTS.snorkel_spots} snorkel spots</b><span>Entry points and snorkel zones drawn on the water</span></span></li>
          <li className="guide-row"><span><b>{COUNTS.activities} activities</b><span>Horseback riding, kayaking, fishing, landmarks</span></span></li>
          <li className="guide-row"><span><b>{COUNTS.essentials} essentials</b><span>Gas stations, ATMs, groceries, pharmacy</span></span></li>
        </ul>
      </section>
    </GuideLayout>
  )
}
