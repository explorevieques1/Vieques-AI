// ============================================================================
//  guide.js — the public "Island guide" (SEO pages): data + per-page SEO
// ============================================================================
//  The guide is the free sample of the paid map: real answers to what people
//  search ("vieques beaches", "playa caracas"), each page ending in one CTA to
//  the map. The homepage stays the conversion page; these pages bring it
//  strangers from Google.
//
//  SINGLE SOURCE OF TRUTH. pageMeta() is used twice:
//    1. in the browser, by <GuideLayout> (title/meta on client-side nav), and
//    2. at build time, by scripts/prerender.mjs, which writes the same
//       title/description/canonical/JSON-LD into static HTML for crawlers.
//  So what Google reads can never drift from what a visitor sees.
//
//  DATA comes from content/guide/beaches.json — a committed snapshot written
//  by backend/export-guide.mjs (the DB is paywalled; see that file for why).
// ============================================================================

import data from '../content/guide/beaches.json'

export const SITE = 'https://explorevieques.org'
export const BEACHES = data.beaches
export const COUNTS = data.counts

export const beachBySlug = (slug) => BEACHES.find((b) => b.slug === slug) || null

// ---- filters on /beaches ---------------------------------------------------
// Derived from the DB fields rather than stored, so editing a beach in
// Supabase and re-exporting re-sorts it automatically.
export const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'calm', label: 'Calm water', test: (b) => /calm/.test(b.water || '') && !/rough/.test(b.water || '') },
  { key: 'snorkel', label: 'Snorkeling', test: (b) => b.types.includes('snorkeling') || b.snorkel.length > 0 },
  { key: 'kids', label: 'Kids', test: (b) => b.types.includes('family') || /kid|famil|child/i.test(b.bestFor || '') },
  { key: 'easy', label: 'Easy to reach', test: (b) => /^easy/i.test(b.access || '') },
]

// "difficult (bumpy dirt road)" → { level: 'Difficult', detail: 'bumpy dirt road' }
// so the list can show the one-word answer and the page the full sentence.
export function splitAccess(access) {
  if (!access) return { level: null, detail: null }
  const m = access.match(/^(easy|moderate|difficult)\b\s*(?:\((.*)\))?\s*(.*)$/i)
  if (!m) return { level: null, detail: access }
  const detail = [m[2], m[3]].filter(Boolean).join(' ').trim() || null
  return { level: cap(m[1]), detail: detail && cap(detail) }
}

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Beaches in the same part of the island — cross-links keep readers on the
// site and give Google a crawl path to every detail page.
export function nearbyBeaches(beach, n = 3) {
  const zone = (r) => (r || '').toLowerCase().split(/[\s/]+/)[0]
  return BEACHES.filter((b) => b.slug !== beach.slug && zone(b.region) === zone(beach.region)).slice(0, n)
}

// ---- SEO -------------------------------------------------------------------

// The snippet Google shows under the blue link on a beach page. It is the
// single biggest lever on whether a searcher clicks US or TripAdvisor.
export function beachMetaDescription(b) {
  // TODO(human): write the real description builder.
  return `${b.name}, Vieques: ${b.water || ''} water. ${b.notes || ''}`.slice(0, 155)
}

const BRAND = ' | Explore Vieques'

// Every guide path that should exist as static HTML. The prerender script
// and the sitemap both read this list.
export function guidePaths() {
  return ['/guide', '/beaches', ...BEACHES.map((b) => `/beaches/${b.slug}`)]
}

const breadcrumb = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({
    '@type': 'ListItem', position: i + 1, name, item: SITE + path,
  })),
})

// { title, description, jsonLd } for a guide path, or null if it isn't one.
export function pageMeta(pathname) {
  const path = pathname.replace(/\/$/, '') || '/'

  if (path === '/guide') {
    return {
      title: 'Vieques Island Guide — Beaches, Snorkeling & Local Tips' + BRAND,
      description: `A local's guide to Vieques, Puerto Rico: all ${BEACHES.length} beaches with water conditions, access and tips, plus what else is on the interactive island map.`,
      jsonLd: [breadcrumb([['Island guide', '/guide']])],
    }
  }

  if (path === '/beaches') {
    return {
      title: `Vieques Beaches — All ${BEACHES.length}, With Water & Access Info` + BRAND,
      description: `Every beach in Vieques, Puerto Rico, by someone who lived there: which are calm, which have snorkeling, which need a 4x4, and when the refuge gates close.`,
      jsonLd: [
        breadcrumb([['Island guide', '/guide'], ['Beaches', '/beaches']]),
        {
          '@type': 'ItemList',
          name: 'Beaches in Vieques, Puerto Rico',
          numberOfItems: BEACHES.length,
          itemListElement: BEACHES.map((b, i) => ({
            '@type': 'ListItem', position: i + 1, name: b.name, url: `${SITE}/beaches/${b.slug}`,
          })),
        },
      ],
    }
  }

  const m = path.match(/^\/beaches\/([a-z0-9-]+)$/)
  const b = m && beachBySlug(m[1])
  if (b) {
    return {
      title: `${b.name}, Vieques — Water, Access & Local Tips` + BRAND,
      description: beachMetaDescription(b),
      jsonLd: [
        breadcrumb([['Island guide', '/guide'], ['Beaches', '/beaches'], [b.name, `/beaches/${b.slug}`]]),
        {
          '@type': 'Beach',
          name: b.name,
          ...(b.localName && b.localName !== b.name ? { alternateName: b.localName } : {}),
          description: b.notes || undefined,
          url: `${SITE}/beaches/${b.slug}`,
          isAccessibleForFree: true,
          publicAccess: true,
          containedInPlace: { '@type': 'Place', name: 'Vieques, Puerto Rico' },
        },
      ],
    }
  }
  return null
}

// JSON-LD as a string that is safe inside <script> (no early </script>).
export const jsonLdString = (items) =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': items }).replace(/</g, '\\u003c')
