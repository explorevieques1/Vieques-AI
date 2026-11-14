import { Link } from 'react-router-dom'
import GuideLayout from '../../components/GuideLayout.jsx'
import { GuideFaq, RelatedGuides, Checked } from '../../components/GuideParts.jsx'
import { TOPICS } from '../../lib/guide.js'
import { FERRY_OFFICIAL, FACTS_CHECKED } from '../../content/guide/topics.js'

// /ferry — head term "vieques ferry" (+ "how to get to vieques", flights).
// The page that ranks today is a Spanish-language PDF; this is the English
// answer. Times are NOT copied here: the operator republishes the schedule
// monthly and a stale timetable strands people. We give everything around the
// schedule (fare, tickets, terminal, parking, timing) and link the source.
const T = TOPICS['/ferry']

export default function FerryGuide() {
  return (
    <GuideLayout
      crumbs={[['Island guide', '/guide'], ['Getting there', '/ferry']]}
      cta={{
        kicker: 'Landing in Vieques?',
        title: 'Know where you’re going before the ferry docks.',
        lede: 'Rentals, taxis, every beach and restaurant on one map, with directions from the ferry terminal or the airport, plus Ask AI.',
      }}
    >
      <header className="guide-head">
        <p className="kicker">Island guide · Getting there</p>
        <h1 className="title">Vieques ferry: how to get to Vieques.</h1>
        <p className="lede">
          Two ways in: the passenger ferry from Ceiba, on Puerto Rico’s east coast (about an hour, $2), or a small plane
          from San Juan (about 30 minutes). There is no ferry from San Juan itself.
        </p>
      </header>

      <dl className="group-list guide-facts">
        <div className="guide-fact"><dt>Leaves from</dt><dd>Ceiba ferry terminal (former Roosevelt Roads base), not Fajardo</dd></div>
        <div className="guide-fact"><dt>Arrives</dt><dd>Isabel Segunda, on Vieques’ north coast</dd></div>
        <div className="guide-fact"><dt>Crossing</dt><dd>About 1 hour</dd></div>
        <div className="guide-fact"><dt>Fare</dt><dd>$2 adult, each way (non-resident increase postponed, see below)</dd></div>
        <div className="guide-fact"><dt>Tickets</dt><dd>Online, in the operator’s app, or at the Ceiba window</dd></div>
        <div className="guide-fact"><dt>From SJU airport</dt><dd>1 to 1.5 hours’ drive to Ceiba</dd></div>
      </dl>

      <section className="guide-sec" aria-labelledby="f-fare">
        <h2 id="f-fare" className="guide-h2">How much is the ferry to Vieques?</h2>
        <p className="guide-prose">
          $2 per adult each way, as of {FACTS_CHECKED}. In 2026 the government announced a non-resident fare of $11.25
          each way; it set off protests that cancelled sailings for a day in April, and the change has since been
          postponed, most recently to December 31, 2026. If you travel after that, check the current fare with the
          operator.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="f-sched">
        <h2 id="f-sched" className="guide-h2">Vieques ferry schedule</h2>
        <p className="guide-prose">
          The operator publishes a new itinerary every month, with extra or moved sailings around holidays, and weather
          and maintenance change it at short notice. Check the current month on{' '}
          <a className="guide-link" href={FERRY_OFFICIAL} target="_blank" rel="noopener">puertoricoferry.com</a>{' '}
          the week you travel, and again the day before.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="f-tix">
        <h2 id="f-tix" className="guide-h2">Buying tickets</h2>
        <ul className="guide-bullets">
          <li><b>Book online as soon as your dates are set</b>, especially for Fridays, Sundays and holidays.</li>
          <li><b>“Sold out” online isn’t the whole story.</b> Only part of each sailing is sold online; more seats are sold at the Ceiba window on the day.</li>
          <li><b>Arrive an hour early.</b> Boarding closes 10 minutes before departure, and the line moves slowly on busy days.</li>
          <li><b>Pack light.</b> You carry your own bags on and off, and space is tight.</li>
        </ul>
      </section>

      <section className="guide-sec" aria-labelledby="f-ceiba">
        <h2 id="f-ceiba" className="guide-h2">Ceiba ferry terminal: getting there and parking</h2>
        <p className="guide-prose">
          The terminal is at the former Roosevelt Roads naval base in Ceiba, about 1 to 1.5 hours’ drive from San Juan
          airport depending on traffic. Ferries used to leave from Fajardo, and older guides still say so; they don’t any
          more. There is a paid lot next to the terminal (bring cash). A taxi from San Juan costs roughly $80 to $100.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="f-car">
        <h2 id="f-car" className="guide-h2">Can you take a car to Vieques?</h2>
        <p className="guide-prose">
          Not easily. The cargo ferry carries vehicles but its space goes mainly to residents, and most main-island rental
          companies don’t allow their cars off the main island. Rent on Vieques instead: companies meet the ferry and the
          planes. See <Link to="/getting-around" className="guide-link">car, jeep and golf cart rentals in Vieques</Link>.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="f-fly">
        <h2 id="f-fly" className="guide-h2">Flights to Vieques</h2>
        <p className="guide-prose">
          Cape Air and Vieques Air Link fly small planes from San Juan (SJU) to Vieques airport (VQS), about 30 minutes
          in the air, and there are short hops from Ceiba. Fares we saw for late 2026 ran from about $100 to $220 one way.
          Flying skips the drive to Ceiba and the ferry line. Bag limits on the small planes are strict, so check yours.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="f-which">
        <h2 id="f-which" className="guide-h2">Ferry or flight?</h2>
        <ul className="guide-bullets">
          <li><b>Ferry</b> if you’re on a budget, already near the east coast, or travelling light on a weekday.</li>
          <li><b>Flight</b> if you land at SJU and want to be on the island the same day without the drive, on holiday weekends when ferries sell out, or with a tight connection.</li>
          <li><b>Coming from Culebra?</b> There’s no dependable direct ferry between the islands; most people go back through Ceiba or fly.</li>
        </ul>
      </section>

      <GuideFaq faq={T.faq} />
      <Checked />
      <RelatedGuides current="/ferry" />
    </GuideLayout>
  )
}
