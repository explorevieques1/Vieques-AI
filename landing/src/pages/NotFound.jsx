import { Link } from 'react-router-dom'

// ============================================================================
//  NotFound — React Router's "*" route.
// ============================================================================
//  In production this renders inside dist/404.html, which Vercel serves with a
//  real 404 status for any path vercel.json doesn't claim — so Google drops the
//  URL instead of indexing a copy of the homepage. Locally (vite dev) it shows
//  for any unknown path, with a 200 — that's just the dev server.
//
//  Someone who lands here most likely followed an old or mistyped link, maybe
//  from an ad or a Facebook post. The page's job is to turn that dead end back
//  into a visit, without a solid orange fill on anything that isn't a buy/start
//  action (see "Landing design system" in CLAUDE.md).
// ============================================================================

const wrap = {
  minHeight: '100vh',
  background: 'var(--pearl)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  padding: '48px 16px',
  textAlign: 'center',
}

export default function NotFound() {
  return (
    <main style={wrap}>
      <div style={{ maxWidth: 480 }}>
        <Link to="/" style={{ color: '#fff', fontWeight: 800, textDecoration: 'none' }}>
          Explore<span style={{ color: 'var(--sea)' }}> Vieques</span>
        </Link>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', margin: '28px 0 12px' }}>
          This page isn’t on the map
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, margin: '0 0 28px' }}>
          The link may be old or mistyped. The beaches, the bio bay and the ferry are all still here.
        </p>
        <p style={{ display: 'flex', gap: 24, justifyContent: 'center', margin: 0 }}>
          <Link to="/" style={{ color: 'var(--sea)', fontWeight: 600 }}>Home</Link>
          <Link to="/guide" style={{ color: 'var(--sea)', fontWeight: 600 }}>Island guide</Link>
        </p>
      </div>
    </main>
  )
}
