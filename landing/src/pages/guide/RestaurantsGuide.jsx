import GuideLayout from '../../components/GuideLayout.jsx'
import { GuideFaq, RelatedGuides } from '../../components/GuideParts.jsx'
import { TOPICS, LISTINGS } from '../../lib/guide.js'

// /restaurants — head term "vieques restaurants" (+ "best restaurants
// esperanza", "isabel segunda restaurants", breakfast, near the ferry).
// Grouped by TOWN because that's how people search and decide. No invented
// rankings: "best" lists come from category tags in Supabase, nothing else.
// Hours/phones stay in the paid map (only 2 of 35 have hours today — when
// that's filled in, "open now" becomes the map's strongest pitch).
const T = TOPICS['/restaurants']

const TOWNS = [
  ['Esperanza', 'r-esp', 'The south-coast strip along the malecón: waterfront tables, bars, sunset and the most tourist-friendly hours. Closest to Sun Bay and Mosquito Bay.'],
  ['Isabel Segunda', 'r-isa', 'The main town, where the ferry docks: local Puerto Rican food, bakeries and breakfast, Italian, and the island’s everyday spots.'],
  ['Florida', 'r-flo', 'Inland between the two towns.'],
  ['Elsewhere on the island', 'r-else', 'Out on their own, worth the drive.'],
]

const PICKS = [
  ['breakfast', 'Breakfast'],
  ['waterfront', 'On the water'],
  ['local', 'Local Puerto Rican'],
  ['fine-dining', 'Fine dining'],
]

const sub = (r) => [r.cuisine, r.price].filter(Boolean).join(' · ')

export default function RestaurantsGuide() {
  const all = LISTINGS.restaurants
  const n = all.length

  return (
    <GuideLayout
      crumbs={[['Island guide', '/guide'], ['Restaurants', '/restaurants']]}
      cta={{
        kicker: 'Hungry, and on the island?',
        title: `All ${n} restaurants pinned, with directions from where you are.`,
        lede: 'See what’s near your beach, filter by cuisine and price, and ask the AI “somewhere on the water for dinner near Esperanza.”',
      }}
    >
      <header className="guide-head">
        <p className="kicker">Island guide · Food</p>
        <h1 className="title">Vieques restaurants: where to eat, town by town.</h1>
        <p className="lede">
          {n} places to eat across the island’s two towns. Esperanza has the waterfront strip; Isabel Segunda, where the
          ferry docks, has the local food and the bakeries. Many close one or two days a week, so check before you drive
          across for dinner.
        </p>
      </header>

      <nav className="chips guide-jump" aria-label="Jump to a town">
        {TOWNS.filter(([t]) => all.some((r) => r.town === t)).map(([t, id]) => (
          <a key={id} href={`#${id}`}>{t}</a>
        ))}
      </nav>

      <section className="guide-sec" aria-labelledby="r-picks">
        <h2 id="r-picks" className="guide-h2">Quick picks</h2>
        <dl className="group-list guide-facts">
          {PICKS.map(([cat, label]) => {
            const names = all.filter((r) => r.cats.includes(cat)).map((r) => `${r.name} (${r.town === 'Elsewhere on the island' ? 'Vieques' : r.town})`)
            return names.length ? (
              <div key={cat} className="guide-fact"><dt>{label}</dt><dd>{names.join(', ')}</dd></div>
            ) : null
          })}
        </dl>
      </section>

      {TOWNS.map(([town, id, blurb]) => {
        const list = all.filter((r) => r.town === town)
        if (!list.length) return null
        return (
          <section key={id} className="guide-sec" aria-labelledby={id}>
            <h2 id={id} className="guide-h2">
              {town === 'Elsewhere on the island' ? 'Elsewhere in Vieques' : `Restaurants in ${town}`}
            </h2>
            <p className="guide-prose guide-prose-sm">{blurb}</p>
            <ul className="group-list guide-plain">
              {list.map((r) => (
                <li key={r.name} className="guide-row">
                  <span><b>{r.name}</b><span>{sub(r)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section className="guide-sec" aria-labelledby="r-tips">
        <h2 id="r-tips" className="guide-h2">Eating out in Vieques: what to know</h2>
        <ul className="guide-bullets">
          <li><b>Hours are island hours.</b> Kitchens close early, many places take a day or two off each week, and some shut for weeks in the slow season.</li>
          <li><b>Book the nice dinners.</b> Fine dining fills up in high season and on weekends.</li>
          <li><b>Lunch near the beaches is scarce.</b> The refuge beaches have no food. Pack lunch, or eat in Esperanza before or after.</li>
          <li><b>Groceries:</b> there are grocery stores in Isabel Segunda and Esperanza for picnic supplies.</li>
          <li><b>Bio bay night?</b> Eat early in Esperanza; it’s minutes from the tour meeting points.</li>
        </ul>
      </section>

      <GuideFaq faq={T.faq} />
      <RelatedGuides current="/restaurants" />
    </GuideLayout>
  )
}
