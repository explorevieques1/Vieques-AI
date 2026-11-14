import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { FAQ } from './src/content/faq.js'

const SITE = 'https://explorevieques.org'

// Structured data for search engines, written into index.html's <head> so a
// crawler sees it without running any JavaScript. The FAQPage entries are
// generated from the same src/content/faq.js the homepage renders, so the
// markup can never drift from what is visible on the page (a Google rule).
function seoJsonLd() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Explore Vieques',
      url: `${SITE}/`,
      logo: `${SITE}/logo.svg`,
      email: 'hello@explorevieques.org',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      name: 'Explore Vieques',
      url: `${SITE}/`,
      publisher: { '@id': `${SITE}/#org` },
      inLanguage: 'en',
    },
    {
      '@type': 'TouristDestination',
      name: 'Vieques, Puerto Rico',
      description:
        'Island off the east coast of Puerto Rico known for its beaches, snorkeling, wild horses and Mosquito Bay, one of the brightest bioluminescent bays in the world.',
      geo: { '@type': 'GeoCoordinates', latitude: 18.1263, longitude: -65.4401 },
      containedInPlace: { '@type': 'Place', name: 'Puerto Rico' },
      touristType: ['Beach', 'Snorkeling', 'Kayaking', 'Ecotourism'],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ]
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/</g, '\\u003c') // never let content close the <script> early
  return {
    name: 'seo-jsonld',
    transformIndexHtml: () => [
      { tag: 'script', attrs: { type: 'application/ld+json' }, children: json, injectTo: 'head' },
    ],
  }
}

export default defineConfig({
  plugins: [react(), seoJsonLd()],
  // Shared by the client build and the SSR pre-render build, so date-based
  // guide content (the bio bay moon calendar) hydrates identically.
  // `npm run build` pins BUILD_DATE once for both builds (they could straddle
  // midnight UTC otherwise); `vite dev` falls back to today.
  define: { __BUILD_DATE__: JSON.stringify(process.env.BUILD_DATE || new Date().toISOString().slice(0, 10)) },
  // strictPort so it always owns 5174 (or fails loudly) instead of silently
  // drifting to 5175 — which would break the backend CORS allowlist.
  server: { port: 5174, host: true, strictPort: true },
})
