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
} finally {
  await pool.end()
}
