#!/usr/bin/env node
// ============================================================================
//  load_trails_geojson.mjs — load a trails FeatureCollection into Supabase via
//  public.import_trails(), in ONE transaction.
//
//    node db/scripts/load_trails_geojson.mjs data/trails/vieques-trails.geojson \
//         [--delete slug1,slug2] [--dry-run]
//
//  --dry-run runs everything, prints the resulting table, then ROLLS BACK.
//  --delete removes stale rows (e.g. branch slugs a newer import no longer
//  produces) inside the same transaction.
//
//  Reads DATABASE_URL from backend/.env (never printed). Same connection
//  settings as backend/server.js.
// ============================================================================
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pg = createRequire(resolve(root, 'backend/package.json'))('pg')

const args = process.argv.slice(2)
const di = args.indexOf('--delete')
if (di >= 0 && !args[di + 1]) { console.error('--delete needs a comma-separated list of slugs'); process.exit(1) }
const file = args.find((a, i) => !a.startsWith('--') && (di < 0 || i !== di + 1))
const DRY = args.includes('--dry-run')
const del = di >= 0 ? args[di + 1].split(',').filter(Boolean) : []
if (!file) { console.error('usage: load_trails_geojson.mjs <file.geojson> [--delete a,b] [--dry-run]'); process.exit(1) }

const env = Object.fromEntries(
  readFileSync(resolve(root, 'backend/.env'), 'utf8').split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
)
if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing from backend/.env')

const fc = JSON.parse(readFileSync(resolve(file), 'utf8'))
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, options: '-c search_path=public,extensions' })
await client.connect()
try {
  await client.query('BEGIN')
  const { rows: [{ n }] } = await client.query('SELECT public.import_trails($1::jsonb) AS n', [JSON.stringify(fc)])
  console.log(`import_trails wrote ${n} of ${fc.features.length} features`)
  if (del.length) {
    const r = await client.query('DELETE FROM public.trails WHERE slug = ANY($1::text[]) RETURNING slug', [del])
    console.log(`deleted ${r.rowCount}: ${r.rows.map((x) => x.slug).join(', ')}`)
  }
  const { rows } = await client.query(
    `SELECT slug, is_active AS live, source, ST_NPoints(geom) AS pts, distance_mi AS mi, published_distance_mi AS pub, difficulty AS diff FROM trails ORDER BY is_active DESC, slug`)
  console.table(rows)
  if (DRY) { await client.query('ROLLBACK'); console.log('--dry-run: rolled back, database unchanged') }
  else { await client.query('COMMIT'); console.log('committed') }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('FAILED, rolled back:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
