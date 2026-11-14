import GuideLayout from '../../components/GuideLayout.jsx'
import { GuideFaq, RelatedGuides, Checked } from '../../components/GuideParts.jsx'
import { TOPICS, LISTINGS, BUILD_DATE } from '../../lib/guide.js'
import { bioBayCalendar, dateRange, shortDate, monthName } from '../../lib/moonCalendar.js'

// /bio-bay — head term "vieques bio bay" / "mosquito bay". The moon calendar
// is the hook: "bio bay calendar" and "best time to see the bio bay" are top
// searches, and every competing page says "check a moon calendar" without
// giving one. Dates are computed from BUILD_DATE (see lib/moonCalendar.js), so each
// deploy rolls the calendar forward.
const T = TOPICS['/bio-bay']

export default function BioBayGuide() {
  // Drop lunar months that are fully in the past at build time.
  const months = bioBayCalendar(BUILD_DATE, 14).filter((m) => m.closedTo >= BUILD_DATE || m.darkTo >= BUILD_DATE).slice(0, 12)
  const next = months.find((m) => m.darkTo >= BUILD_DATE)
  const ops = LISTINGS.bioBay

  return (
    <GuideLayout
      crumbs={[['Island guide', '/guide'], ['Bio Bay', '/bio-bay']]}
      cta={{
        kicker: 'Planning the bio bay night?',
        title: 'Every tour operator, the bay and your beach day on one map.',
        lede: 'Mosquito Bay and the tour operators pinned, directions from where you’re staying, and Ask AI for "a calm beach near Esperanza before my 8pm tour."',
      }}
    >
      <header className="guide-head">
        <p className="kicker">Island guide · Mosquito Bay</p>
        <h1 className="title">Vieques Bio Bay: the best nights to go, by date.</h1>
        <p className="lede">
          Mosquito Bay was named the brightest bioluminescent bay in the world by Guinness World Records. Go within
          three nights of the new moon, book a licensed tour, and skip the full-moon week when most operators don’t run.
        </p>
      </header>

      {next && (
        <dl className="group-list guide-facts">
          <div className="guide-fact"><dt>Next dark nights</dt><dd><b>{dateRange(next.darkFrom, next.darkTo)}</b> (new moon {shortDate(next.newMoon)})</dd></div>
          <div className="guide-fact"><dt>Tours closed</dt><dd>{dateRange(next.closedFrom, next.closedTo)} (full moon {shortDate(next.fullMoon)})</dd></div>
          <div className="guide-fact"><dt>Swimming</dt><dd>Not allowed. Kayak, clear kayak or electric boat only</dd></div>
          <div className="guide-fact"><dt>Tours from</dt><dd>About $65 per person (kayak), $85 (electric boat)</dd></div>
          <div className="guide-fact"><dt>Where</dt><dd>South coast, a few minutes from Esperanza</dd></div>
        </dl>
      )}

      <section className="guide-sec" aria-labelledby="bb-cal">
        <h2 id="bb-cal" className="guide-h2">Bio bay calendar: best nights for the next 12 months</h2>
        <p className="guide-prose guide-prose-sm">
          <b>Darkest nights</b> are the new moon and three nights either side, when there is no moon in the evening sky.
          {' '}<b>Full-moon nights</b> are the full moon and the night either side, when most operators cancel. Dates are
          Puerto Rico time.
        </p>
        <div className="group-list guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr><th scope="col">Month</th><th scope="col">Darkest nights</th><th scope="col">Full moon (tours closed)</th></tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.newMoon}>
                  {/* Some months hold two new moons; label the second so it doesn't read as a duplicate row. */}
                  <th scope="row">{months[i - 1]?.month === m.month ? 'Late ' : ''}{monthName(m.month)}</th>
                  <td className="good">{dateRange(m.darkFrom, m.darkTo)}</td>
                  <td>{dateRange(m.closedFrom, m.closedTo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="guide-note">
          Calculated from the moon’s phases. Each operator sets its own closed nights, so confirm with yours when you book.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="bb-why">
        <h2 id="bb-why" className="guide-h2">Why the moon matters</h2>
        <p className="guide-prose">
          The water glows because of a single-celled plankton, <i>Pyrodinium bahamense</i>, that flashes blue-green when
          it’s disturbed. The glow is there every night of the year, but it is faint, and moonlight drowns it out. On a
          new-moon night every paddle stroke lights up; under a full moon you can struggle to see it at all. Between those
          two, a late-rising moon (the week after the full moon) still leaves the early evening dark.
        </p>
      </section>

      <section className="guide-sec" aria-labelledby="bb-tours">
        <h2 id="bb-tours" className="guide-h2">Mosquito Bay tours</h2>
        <p className="guide-prose guide-prose-sm">
          You can only go with a licensed operator. Choose a <b>kayak</b> (you paddle, the most immersive), a
          {' '}<b>clear-bottom kayak</b> (see the glow under you), or an <b>electric boat</b> (no paddling; easiest with
          kids or limited mobility). Book a few days ahead, and further ahead for new-moon weekends.
        </p>
        <ul className="group-list guide-plain">
          {ops.map((o) => (
            <li key={o.name} className="guide-row guide-row-top">
              <span>
                <b>{o.name}</b>
                {o.about && <span>{o.about}</span>}
                {o.prices.length > 0 && <span className="guide-price">{o.prices.join(' · ')}</span>}
              </span>
              <a className="guide-ext" href={o.website} target="_blank" rel="noopener nofollow">Website</a>
            </li>
          ))}
        </ul>
        <p className="guide-note">Prices as listed by each operator; they change, so check when you book.</p>
      </section>

      <section className="guide-sec" aria-labelledby="bb-tips">
        <h2 id="bb-tips" className="guide-h2">Before you go</h2>
        <ul className="guide-bullets">
          <li><b>Stay the night.</b> Tours start after dark, and the last ferry back to the main island usually leaves before you’d get back.</li>
          <li><b>No spray-on bug repellent or sunscreen</b> before the tour; it harms the plankton. Wear long sleeves instead.</li>
          <li><b>Photos rarely work.</b> Phone cameras can’t catch the glow. Leave the phone in a dry bag and look.</li>
          <li><b>Clouds are fine, rain can be too.</b> An overcast new-moon night is darker still. Operators cancel for storms and high wind.</li>
          <li><b>Plan the day around it.</b> Beaches by day, an early dinner in Esperanza, then the tour.</li>
        </ul>
      </section>

      <GuideFaq faq={T.faq} />
      <Checked />
      <RelatedGuides current="/bio-bay" />
    </GuideLayout>
  )
}
