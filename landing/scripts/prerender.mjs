// ============================================================================
//  prerender.mjs — write the Island guide pages as static HTML (runs in build)
// ============================================================================
//  npm run build =  vite build                       → dist/ (the SPA)
//                 + vite build --ssr entry-server    → dist-server/ (temp)
//                 + node scripts/prerender.mjs       → dist/<path>/index.html
//
//  For each path in guidePaths() this renders the React page to HTML and
//  writes it with ITS OWN <head> (title, description, canonical, OG, JSON-LD).
//  Vercel serves a real file before applying the SPA rewrite in vercel.json,
//  so /beaches gets dist/beaches/index.html while /, /pricing, /signup… keep
//  falling through to the client-rendered dist/index.html exactly as before.
//
//  It also writes dist/sitemap.xml, so a new beach in the export lands in the
//  sitemap automatically.
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const SERVER = path.join(ROOT, 'dist-server')

const { render, guidePaths, pageMeta, jsonLdString, SITE } =
  await import(pathToFileURL(path.join(SERVER, 'entry-server.js')).href)

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Replace exactly one match or fail the build — a silent no-op here would
// ship pages that all claim to be the homepage, which is the bug this fixes.
function swap(html, re, value, what) {
  const n = (html.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length
  if (n !== 1) throw new Error(`prerender: expected 1 ${what} in dist/index.html, found ${n}`)
  return html.replace(re, value)
}

function pageHtml(urlPath) {
  const meta = pageMeta(urlPath)
  if (!meta) throw new Error(`prerender: no pageMeta for ${urlPath}`)
  const url = SITE + urlPath
  let h = template
  h = swap(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`, '<title>')
  h = swap(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.description)}">`, 'meta description')
  h = swap(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, 'canonical')
  h = swap(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, 'og:url')
  for (const k of ['og:title', 'og:description']) {
    const v = k.endsWith('title') ? meta.title : meta.description
    h = swap(h, new RegExp(`<meta property="${k}" content="[^"]*">`), `<meta property="${k}" content="${esc(v)}">`, k)
  }
  for (const k of ['twitter:title', 'twitter:description']) {
    const v = k.endsWith('title') ? meta.title : meta.description
    h = swap(h, new RegExp(`<meta name="${k}" content="[^"]*">`), `<meta name="${k}" content="${esc(v)}">`, k)
  }
  // The homepage's JSON-LD includes FAQPage — Google requires structured data
  // to match visible content, and the FAQ isn't on these pages. Replace it.
  h = swap(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${jsonLdString(meta.jsonLd)}</script>`, 'JSON-LD')
  // Homepage-only weight: the hero screenshot preload and the no-JS <h1>
  // (a second h1 here would compete with the page's own).
  h = h.replace(/<link rel="preload" as="image"[^>]*>\s*/g, '')
  h = h.replace(/<noscript>[\s\S]*?<\/noscript>\s*/, '')
  h = swap(h, /<div id="root"><\/div>/, `<div id="root">${render(urlPath)}</div>`, '#root')
  return h
}

const paths = guidePaths()
for (const p of paths) {
  const file = path.join(DIST, p, 'index.html')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, pageHtml(p))
}

// Sitemap: the hand-picked SPA routes + every guide page.
const today = new Date().toISOString().slice(0, 10)
const entries = [
  ['/', 'weekly', '1.0'],
  ['/guide', 'weekly', '0.9'],
  ['/beaches', 'weekly', '0.9'],
  // Cluster pages: the island's highest-intent searches (see topics.js).
  ['/ferry', 'weekly', '0.9'],
  ['/bio-bay', 'weekly', '0.9'],
  ['/getting-around', 'weekly', '0.9'],
  ['/restaurants', 'weekly', '0.9'],
  ['/pricing', 'monthly', '0.8'],
  ...paths.filter((p) => p.startsWith('/beaches/')).map((p) => [p, 'monthly', '0.7']),
  ['/signup', 'yearly', '0.5'],
  ['/terms', 'yearly', '0.2'],
  ['/privacy', 'yearly', '0.2'],
  ['/refunds', 'yearly', '0.2'],
]
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([p, f, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml)
fs.rmSync(SERVER, { recursive: true, force: true })

console.log(`prerendered ${paths.length} guide pages + sitemap.xml (${entries.length} URLs)`)
