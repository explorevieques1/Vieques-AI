import { Link } from 'react-router-dom'
import GuideLayout from '../../components/GuideLayout.jsx'
import { GuideFaq, RelatedGuides, Checked, Phone } from '../../components/GuideParts.jsx'
import { TOPICS, LISTINGS } from '../../lib/guide.js'

// /getting-around — head term "vieques car rental" (+ golf cart, jeep, taxi,
// "do you need a car", "does vieques have uber"). The listings ARE the answer
// for "vieques taxi number" / "car rental near ferry", so names and tap-to-call
// numbers are public here; the map adds pins, routes and the rest.
const T = TOPICS['/getting-around']

const GROUPS = [
  ['car-rental', 'Car and jeep rentals', 'gr-cars'],
  ['golfcart-utv', 'Golf cart and UTV rentals', 'gr-carts'],
  ['taxis', 'Taxis and públicos', 'gr-taxis'],
]

export default function GettingAroundGuide() {
  const byCat = (slug) => LISTINGS.transport.filter((t) => t.cats.includes(slug))

  return (
    <GuideLayout
      crumbs={[['Island guide', '/guide'], ['Getting around', '/getting-around']]}
      cta={{
        kicker: 'Got your wheels?',
        title: 'Now see which beaches your car can actually reach.',
        lede: 'Every beach marked by access, from paved road to 4x4 track, with directions, refuge gate times, plus restaurants, gas and Ask AI on one map.',
      }}
    >
      <header className="guide-head">
        <p className="kicker">Island guide · Getting around</p>
        <h1 className="title">Vieques car rental, golf carts and taxis.</h1>
        <p className="lede">
          Rent a car or jeep on the island, booked before you arrive. Taxis and públicos cover the towns, but the best
          beaches are inside the wildlife refuge on dirt roads, and Uber isn’t something you can count on here.
        </p>
      </header>

      <dl className="group-list guide-facts">
        <div className="guide-fact"><dt>Best option</dt><dd>Jeep or high-clearance car, rented on Vieques</dd></div>
        <div className="guide-fact"><dt>Book</dt><dd>Weeks ahead in high season; the island runs out</dd></div>
        <div className="guide-fact"><dt>Pickup</dt><dd>Many companies meet the ferry or the airport</dd></div>
        <div className="guide-fact"><dt>Uber</dt><dd>Not reliable. Use local taxis and públicos</dd></div>
        <div className="guide-fact"><dt>Gas</dt><dd>Three stations on the whole island; fill up when you can</dd></div>
      </dl>

      <section className="guide-sec" aria-labelledby="gr-need">
        <h2 id="gr-need" className="guide-h2">Do you need a car in Vieques?</h2>
        <p className="guide-prose">
          If you want to see the island, yes. Vieques is about 21 miles long, the two towns are on opposite coasts, and
          the beaches people come for (<Link to="/beaches/playa-caracas" className="guide-link">Caracas</Link>,
          {' '}<Link to="/beaches/playa-la-chiva" className="guide-link">La Chiva</Link>,
          {' '}<Link to="/beaches/playa-navio" className="guide-link">Navío</Link>,
          {' '}<Link to="/beaches/punta-arenas" className="guide-link">Green Beach</Link>) are spread along the south
          coast and the west end, most of them inside the Vieques National Wildlife Refuge. Staying in Esperanza with a couple of nearby beaches,
          taxis are enough. For anything more, rent.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="gr-which">
        <h2 id="gr-which" className="guide-h2">Golf cart, jeep or car?</h2>
        <ul className="guide-bullets">
          <li><b>Jeep / 4x4:</b> the safe choice for refuge beaches with rough dirt tracks, and in the rainy season.</li>
          <li><b>Car:</b> fine for paved roads, the towns and the easier beaches. Ask the company about high clearance.</li>
          <li><b>Golf cart or UTV:</b> fun around Esperanza and Isabel Segunda. Slow on the hills, open to the rain, and rough on refuge roads.</li>
        </ul>
        <p className="guide-prose guide-prose-sm">
          Not sure which beaches you’ll reach? <Link to="/beaches" className="guide-link">Every Vieques beach with its road access</Link>.
        </p>
      </section>

      {GROUPS.map(([slug, label, id]) => {
        const items = byCat(slug)
        if (!items.length) return null
        return (
          <section key={slug} className="guide-sec" aria-labelledby={id}>
            <h2 id={id} className="guide-h2">{label}</h2>
            {slug === 'taxis' && (
              <p className="guide-prose guide-prose-sm">
                Most don’t use meters: <b>agree on the price before you get in</b>. Públicos (shared vans) wait at the
                ferry terminal and the airport and run mainly between Isabel Segunda and Esperanza, a few dollars per
                person. For a pickup at night or from a remote beach, call ahead and arrange a time.
              </p>
            )}
            <ul className="group-list guide-plain">
              {items.map((t) => (
                <li key={t.name} className="guide-row">
                  <span>
                    <b>{t.name}</b>
                    {t.hours && <span>{t.hours}</span>}
                  </span>
                  <span className="guide-tels">{t.phones.map((p) => <Phone key={p} n={p} />)}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section className="guide-sec" aria-labelledby="gr-tips">
        <h2 id="gr-tips" className="guide-h2">Driving in Vieques</h2>
        <ul className="guide-bullets">
          <li><b>Fill up when you can.</b> Fuel comes by boat, and the stations can run dry in busy weeks.</li>
          <li><b>Refuge gates close at sunset.</b> Leave the south-coast beaches in time.</li>
          <li><b>Watch for horses.</b> Hundreds of horses roam free, including on the roads after dark.</li>
          <li><b>Phone signal drops</b> in parts of the refuge. Load your route before you go.</li>
          <li><b>Don’t leave valuables in an open jeep or cart</b> at the beach.</li>
        </ul>
      </section>

      <GuideFaq faq={T.faq} />
      <Checked />
      <RelatedGuides current="/getting-around" />
    </GuideLayout>
  )
}
