import { Link, useParams } from 'react-router-dom'
import GuideLayout from '../../components/GuideLayout.jsx'
import { ChevronIcon } from '../../components/icons.jsx'
import { beachBySlug, nearbyBeaches, splitAccess, cap } from '../../lib/guide.js'

// /beaches/:slug — one page per beach, targeting its name ("playa caracas",
// "navio beach vieques"). Content is the free slice exported by
// backend/export-guide.mjs; exact pins and routes stay in the paid map.
export default function BeachGuide() {
  const { slug } = useParams()
  const b = beachBySlug(slug)

  if (!b) {
    return (
      <GuideLayout crumbs={[['Island guide', '/guide'], ['Beaches', '/beaches']]}>
        <header className="guide-head">
          <h1 className="title">We don't have that beach.</h1>
          <p className="lede"><Link to="/beaches" className="guide-link">See all Vieques beaches</Link></p>
        </header>
      </GuideLayout>
    )
  }

  const access = splitAccess(b.access)
  const facts = [
    ['Water', b.water && cap(b.water)],
    ['Access', [access.level, access.detail].filter(Boolean).join(' — ')],
    ['Best for', b.bestFor && cap(b.bestFor)],
    ['Area', b.region],
    ['Hours', b.gates || (b.refuge ? 'Refuge gates close at sunset' : null)],
  ].filter(([, v]) => v)
  const nearby = nearbyBeaches(b)

  return (
    <GuideLayout crumbs={[['Island guide', '/guide'], ['Beaches', '/beaches'], [b.name, `/beaches/${b.slug}`]]}>
      <header className="guide-head">
        <p className="kicker">{b.refuge ? 'Vieques Wildlife Refuge' : 'Vieques beach'}</p>
        <h1 className="title">{b.name}</h1>
        {b.localName && b.localName !== b.name && <p className="guide-aka">Also known as {b.localName}</p>}
      </header>

      <dl className="group-list guide-facts">
        {facts.map(([k, v]) => (
          <div key={k} className="guide-fact"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>

      {b.notes && (
        <section className="guide-sec" aria-labelledby="b-notes">
          <h2 id="b-notes" className="guide-h2">Local notes</h2>
          <p className="guide-prose">{b.notes}</p>
        </section>
      )}

      {b.snorkel.length > 0 && (
        <section className="guide-sec" aria-labelledby="b-snorkel">
          <h2 id="b-snorkel" className="guide-h2">Snorkeling here</h2>
          <ul className="group-list guide-plain">
            {b.snorkel.map((s) => (
              <li key={s.name} className="guide-row">
                <span><b>{s.name}</b>{s.difficulty && <span>{cap(s.difficulty)}</span>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nearby.length > 0 && (
        <section className="guide-sec" aria-labelledby="b-near">
          <h2 id="b-near" className="guide-h2">Nearby beaches</h2>
          <ul className="group-list guide-list">
            {nearby.map((n) => (
              <li key={n.slug}>
                <Link to={`/beaches/${n.slug}`} className="guide-row">
                  <span><b>{n.name}</b><span>{n.water && `${cap(n.water)} water`}</span></span>
                  <ChevronIcon />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </GuideLayout>
  )
}
