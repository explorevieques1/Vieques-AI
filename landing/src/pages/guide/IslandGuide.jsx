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
          <Link to="/beaches" className="guide-row">
            <span>
              <b>Vieques beaches</b>
              <span>All {BEACHES.length} — calm or rough, how to get there, local tips</span>
            </span>
            <ChevronIcon />
          </Link>
        </div>
      </section>

      <section className="guide-sec" aria-labelledby="g-app">
        <h2 id="g-app" className="guide-h2">Also on the map</h2>
        <ul className="group-list guide-plain">
          {/* Each line describes columns/categories that exist in Supabase
              (restaurant_listings.cuisine/hours/price, activity_categories,
              transport_categories). Don't promise a feature the app lacks. */}
          <li className="guide-row"><span><b>{COUNTS.restaurants} restaurants</b><span>Cuisine, hours and price range</span></span></li>
          <li className="guide-row"><span><b>{COUNTS.snorkel_spots} snorkel spots</b><span>Entry points and snorkel zones on the map</span></span></li>
          <li className="guide-row"><span><b>{COUNTS.activities} activities</b><span>Bio bay tours, kayaking, horseback riding, fishing</span></span></li>
          <li className="guide-row"><span><b>{COUNTS.transport} ways to get around</b><span>Ferry, car and golf-cart rentals, taxis and públicos</span></span></li>
        </ul>
      </section>
    </GuideLayout>
  )
}
