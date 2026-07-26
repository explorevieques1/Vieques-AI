#!/usr/bin/env node
// ============================================================================
//  sync_tripadvisor_coords.mjs — adopt Tripadvisor's coordinates for stays
// ============================================================================
//
//      cd backend && node ../db/scripts/sync_tripadvisor_coords.mjs
//      cd backend && node ../db/scripts/sync_tripadvisor_coords.mjs --revert
//
//  WHY THIS EXISTS
//  ---------------
//  The seed coordinates in 0027_stays.sql were hand-placed off the street
//  address; Tripadvisor has its own point for each listing, and the two
//  disagree by 30–700m. Both are "right" in the sense that both land on the
//  property, but the map should not show a pin in one place while the panel
//  underneath it shows a rating sourced from a listing pinned somewhere else.
//  One source wins, and for now that is Tripadvisor.
//
//  WHY IT WRITES TO THE TABLE INSTEAD OF OVERRIDING IN THE CLIENT
//  --------------------------------------------------------------
//  The pin is not the only consumer of lat/lng. Result-card distances, the
//  "get directions" link and the map's fit-bounds all read the same two
//  columns, and they resolve *before* the detail panel has fetched anything
//  from Tripadvisor. Overriding coordinates in the panel would move the pin
//  but leave the distance label and the directions link pointing at the old
//  spot — three sources of truth for one property. Writing once, upstream of
//  every reader, keeps them agreeing.
//
//  REVERSIBLE ON PURPOSE
//  ---------------------
//  The seed value is copied to metadata.seed_coords before the first
//  overwrite, and `--revert` puts it back. Adopting a third party's idea of
//  where a hotel is should not be a one-way door: if Tripadvisor turns out to
//  place a property badly (their point for a villa collective can sit on the
//  management office rather than the villa), we need the curated value back
//  without re-deriving it from the address.
//
//  Only touches rows that HAVE a tripadvisor_location_id. Properties left
//  NULL by resolve_tripadvisor_ids.mjs keep their seed coordinates.
// ============================================================================

import { createRequire } from 'node:module'

import '../../backend/env.js'

// See resolve_tripadvisor_ids.mjs — an ESM bare specifier resolves from this
// file's directory, not the cwd, so `pg` has to be anchored at backend/.
const require = createRequire(new URL('../../backend/package.json', import.meta.url))
const pg = require('pg')

const REVERT = process.argv.includes('--revert')
const KEY = process.env.TRIPADVISOR_API_KEY
const REFERER = process.env.TRIPADVISOR_REFERER

if (!KEY && !REVERT) {
  console.error('TRIPADVISOR_API_KEY is not set. Add it to backend/.env first.')
  process.exit(1)
}

const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
      },
)

/** Metres between two lat/lng pairs — reported so a surprising move is visible. */
function metresBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

async function revert() {
  const { rows } = await pool.query(
    `SELECT id, name, metadata->'seed_coords' AS seed
       FROM stay_listings
      WHERE metadata ? 'seed_coords'`,
  )
  if (!rows.length) {
    console.log('No row has a saved seed_coords — nothing to revert.')
    return
  }
  for (const r of rows) {
    await pool.query(
      `UPDATE stay_listings
          SET latitude = $2, longitude = $3, metadata = metadata - 'seed_coords'
        WHERE id = $1`,
      [r.id, r.seed.latitude, r.seed.longitude],
    )
    console.log(`reverted ${r.name} -> ${r.seed.latitude}, ${r.seed.longitude}`)
  }
}

async function sync() {
  const { rows } = await pool.query(
    `SELECT id, name, latitude, longitude, tripadvisor_location_id
       FROM stay_listings
      WHERE tripadvisor_location_id IS NOT NULL AND is_active = true
      ORDER BY name`,
  )

  if (!rows.length) {
    console.log('No stay has a tripadvisor_location_id yet.')
    console.log('Run resolve_tripadvisor_ids.mjs first.')
    return
  }

  for (const stay of rows) {
    const url = new URL(
      `https://api.content.tripadvisor.com/api/v1/location/${stay.tripadvisor_location_id}/details`,
    )
    url.searchParams.set('key', KEY)
    url.searchParams.set('language', 'en')

    const res = await fetch(url, {
      headers: { accept: 'application/json', ...(REFERER ? { Referer: REFERER } : {}) },
    })
    if (!res.ok) {
      // 401 code 160 is a freshly-issued key still propagating across their
      // fleet, and it clears itself within a few minutes — worth retrying
      // rather than treating as a dead key.
      console.error(`  ! ${stay.name}: ${res.status} ${(await res.text()).slice(0, 120)}`)
      continue
    }

    const d = await res.json()
    const lat = d.latitude != null ? Number(d.latitude) : null
    const lng = d.longitude != null ? Number(d.longitude) : null
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      console.log(`  - ${stay.name}: Tripadvisor has no coordinates, keeping ours`)
      continue
    }

    const moved =
      stay.latitude != null && stay.longitude != null
        ? metresBetween(stay.latitude, stay.longitude, lat, lng)
        : null

    // COALESCE so the seed is captured on the first run only; re-running must
    // not overwrite the original with an already-adopted Tripadvisor value.
    await pool.query(
      `UPDATE stay_listings
          SET metadata = jsonb_set(
                metadata, '{seed_coords}',
                COALESCE(metadata->'seed_coords',
                         jsonb_build_object('latitude', latitude, 'longitude', longitude)),
                true),
              latitude = $2,
              longitude = $3
        WHERE id = $1`,
      [stay.id, lat, lng],
    )

    console.log(
      `  ${stay.name}: ${lat}, ${lng}` + (moved != null ? `  (moved ${moved}m)` : ''),
    )
  }
}

await (REVERT ? revert() : sync())
await pool.end()
