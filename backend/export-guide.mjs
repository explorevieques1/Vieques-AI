#!/usr/bin/env node
/**
 * export-guide — snapshot the PUBLIC "free sample" slice of the island data
 * into the landing app, so the SEO guide pages (explorevieques.org/beaches…)
 * can be pre-rendered to static HTML at build time.
 *
 *   node export-guide.mjs          # from backend/
 *
 * Writes landing/src/content/guide/beaches.json. Commit the result.
 *
 * WHY A COMMITTED SNAPSHOT, NOT A LIVE FETCH AT BUILD TIME
 * --------------------------------------------------------
 *  - The beaches table is paywalled by RLS ("tier read", tier_rank() >= 1), so
 *    the landing build cannot read it with the anon key — and it shouldn't be
 *    opened up just for this. This script runs with the backend's own
 *    DATABASE_URL (the gatekeeper), on a developer's machine.
 *  - A Vercel build that depended on a live DB/API would break deploys — or
 *    worse, publish empty pages to Google — the next time the backend is down
 *    (it was down Aug→Nov 2026 unnoticed).
 *  - The JSON shows up in the git diff, so you SEE what becomes public.
 *
 * WHAT IS (AND ISN'T) EXPORTED — the free sample vs. the paid map
 * ----------------------------------------------------------------
 *  Public:   names, region, water, access, best-for, gate hours, local notes,
 *            names + difficulty of snorkel spots at that beach.
 *  Withheld: exact coordinates, snorkel zone polygons, photos, entry notes,
 *            routing — that is what the paid map is for. Do NOT add latitude/
 *            longitude here without deciding to give that away on purpose.
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const OUT = path.resolve(import.meta.dirname, '../landing/src/content/guide/beaches.json')

function env() {
  const raw = fs.readFileSync(path.join(import.meta.dirname, '.env'), 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

// URL slug from the English name: "Playa Caracas (Red Beach)" → "playa-caracas".
// The parenthetical is dropped so the slug stays short and stable even if the
// nickname is edited later. Accents are folded (Malecón → malecon).
function slugify(name) {
  return name
    .replace(/\(.*?\)/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Tidy free-text fields: trim, collapse spaces, and treat "N/A" as absent so
// the page doesn't print a row that says nothing.
function clean(v) {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' || /^n\/?a$/i.test(s) ? null : s
}

const E = env()
const pool = new pg.Pool({
  connectionString: E.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: '-c search_path=public,extensions', // pooler gotcha, see server.js
})

try {
  const { rows } = await pool.query(`
    SELECT b.id, b.name, b.local_name, b.region, b.type, b.water_conditions,
           b.access, b.best_for, b.gate_hours, b.in_wildlife_refuge, b.notes,
           COALESCE((
             SELECT json_agg(json_build_object('name', s.name, 'difficulty', s.difficulty) ORDER BY s.name)
             FROM snorkel_spots s WHERE s.beach_id = b.id AND s.is_active
           ), '[]') AS snorkel
    FROM beaches b
    WHERE b.is_active
    ORDER BY b.name`)

  const beaches = rows.map((b) => ({
    slug: slugify(b.name),
    name: clean(b.name),
    localName: clean(b.local_name),
    region: clean(b.region),
    types: (b.type || []).map((t) => clean(t)?.toLowerCase()).filter(Boolean),
    water: clean(b.water_conditions)?.toLowerCase() ?? null,
    access: clean(b.access),
    bestFor: clean(b.best_for),
    gates: clean(b.gate_hours),
    refuge: !!b.in_wildlife_refuge,
    notes: clean(b.notes),
    snorkel: b.snorkel.map((s) => ({ name: clean(s.name), difficulty: clean(s.difficulty)?.toLowerCase() ?? null })),
  }))

  const dupes = beaches.map((b) => b.slug).filter((s, i, a) => a.indexOf(s) !== i)
  if (dupes.length) throw new Error(`duplicate slugs: ${dupes.join(', ')} — rename one beach`)

  // Real counts for the "what else is on the map" teaser. CLAUDE.md rule:
  // numbers on the landing come from Supabase, never rounded up.
  const { rows: [counts] } = await pool.query(`
    SELECT (SELECT count(*) FROM restaurant_listings)::int AS restaurants,
           (SELECT count(*) FROM activity_listings)::int   AS activities,
           (SELECT count(*) FROM snorkel_spots WHERE is_active)::int AS snorkel_spots,
           (SELECT count(*) FROM transport_listings)::int  AS transport,
           (SELECT count(*) FROM essential_listings)::int  AS essentials`)

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({ exportedAt: new Date().toISOString().slice(0, 10), counts, beaches }, null, 2) + '\n')
  console.log(`wrote ${beaches.length} beaches → ${path.relative(process.cwd(), OUT)}`)

  // ---- listings.json: the /getting-around, /bio-bay and /restaurants pages --
  //  Public:   business names, category, town, cuisine, price band, and for
  //            transport/tour operators the phone/website/hours they advertise
  //            (a searcher for "vieques taxi" needs the number — that IS the
  //            answer, and these are businesses listing themselves for hire).
  //  Withheld: coordinates, photos, restaurant contact details — the map's job.
  const cats = (t, lc, c) => `COALESCE((SELECT array_agg(c.slug ORDER BY c.sort_order) FROM ${lc} lc
      JOIN ${c} c ON c.id = lc.category_id WHERE lc.listing_id = ${t}.id), '{}') AS cats`
  const { rows: tr } = await pool.query(`
    SELECT t.name, t.phones, t.hours, t.website, ${cats('t', 'transport_listing_categories', 'transport_categories')}
    FROM transport_listings t WHERE t.is_active ORDER BY t.name`)
  const { rows: ac } = await pool.query(`
    SELECT a.name, a.description, a.price_info, a.website, ${cats('a', 'activity_listing_categories', 'activity_categories')}
    FROM activity_listings a WHERE a.is_active ORDER BY a.name`)
  const { rows: rs } = await pool.query(`
    SELECT r.name, r.location_area, r.cuisine, r.price, ${cats('r', 'restaurant_listing_categories', 'restaurant_categories')}
    FROM restaurant_listings r WHERE r.is_active ORDER BY r.name`)

  // Placeholder seed rows (example.com) must never reach a public page.
  const realSite = (u) => (u && !/example\.(com|org)/i.test(u) ? u : null)
  const lines = (s) => (clean(s) ? String(s).split(/\n+/).map(clean).filter(Boolean) : [])
  // "Isabel II" in the DB; searchers type "Isabel Segunda".
  const town = (a) => ({ 'Isabel II': 'Isabel Segunda', Vieques: 'Elsewhere on the island' }[clean(a)] || clean(a))

  const listings = {
    transport: tr.map((t) => ({
      name: clean(t.name), cats: t.cats, phones: t.phones || [], hours: clean(t.hours), website: realSite(t.website),
    })),
    bioBay: ac.filter((a) => a.cats.includes('bio-bay') && realSite(a.website)).map((a) => ({
      name: clean(a.name), about: clean(a.description), prices: lines(a.price_info), website: realSite(a.website),
    })),
    restaurants: rs.map((r) => ({
      name: clean(r.name), town: town(r.location_area), cuisine: clean(r.cuisine), price: clean(r.price), cats: r.cats,
    })),
  }
  const LOUT = path.join(path.dirname(OUT), 'listings.json')
  fs.writeFileSync(LOUT, JSON.stringify({ exportedAt: new Date().toISOString().slice(0, 10), ...listings }, null, 2) + '\n')
  console.log(`wrote ${listings.transport.length} transport, ${listings.bioBay.length} bio bay, ${listings.restaurants.length} restaurants → ${path.relative(process.cwd(), LOUT)}`)
} finally {
  await pool.end()
}
