import { useState } from 'react'
import { Link } from 'react-router-dom'
import GuideLayout from '../../components/GuideLayout.jsx'
import { ChevronIcon } from '../../components/icons.jsx'
import { BEACHES, FILTERS, splitAccess, cap } from '../../lib/guide.js'

// /beaches — targets "vieques beaches", "best beaches in vieques".
//
// The filter is client-only state that starts at "All", so the pre-rendered
// HTML (what Google indexes) always lists every beach, and hydration matches.
export default function BeachesGuide() {
  const [filter, setFilter] = useState('all')
  const test = FILTERS.find((f) => f.key === filter).test
  const shown = BEACHES.filter(test)

  return (
    <GuideLayout crumbs={[['Island guide', '/guide'], ['Beaches', '/beaches']]}>
      <header className="guide-head">
        <p className="kicker">Island guide</p>
        <h1 className="title">All {BEACHES.length} beaches in Vieques.</h1>
        <p className="lede">
          Calm or rough, paved road or 4x4 track, crowded or yours alone. Most of the best ones are inside the
          wildlife refuge on the south coast, and its gates close at sunset.
        </p>
      </header>

      <div className="chips" role="group" aria-label="Filter beaches">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <ul className="group-list guide-list" aria-live="polite">
        {shown.map((b) => {
          const { level } = splitAccess(b.access)
          return (
            <li key={b.slug}>
              <Link to={`/beaches/${b.slug}`} className="guide-row">
                <span>
                  <b>{b.name}</b>
                  <span>
                    {[b.region, b.water && `${cap(b.water)} water`, level && `${level} access`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <ChevronIcon />
              </Link>
            </li>
          )
        })}
      </ul>
    </GuideLayout>
  )
}
