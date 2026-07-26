#!/usr/bin/env node
// ============================================================================
//  resolve_tripadvisor_ids.mjs — map listing rows to Tripadvisor ids
// ============================================================================
//
//  Run once per new listing, from a host the Tripadvisor key allows (an IP on
//  its allowlist, or any host if TRIPADVISOR_REFERER matches a referer-
//  restricted key):
//
//      cd backend && node ../db/scripts/resolve_tripadvisor_ids.mjs
//      cd backend && node ../db/scripts/resolve_tripadvisor_ids.mjs --restaurants
//
//  (Run it from backend/ so it picks up backend/.env — the script reads
//  TRIPADVISOR_API_KEY and DATABASE_URL from the same place the server does.)
//
//  WHY THIS PRINTS SQL INSTEAD OF WRITING IT
//  -----------------------------------------
//  Tripadvisor's /location/search is a fuzzy text match with no confidence
//  score, and the failure mode is silent: search "Bravos Boyz Villa Rentals"
//  and you will get *something* back — most likely an unrelated Vieques hotel,
//  because a villa-rental collective has no Tripadvisor listing of its own.
//  Auto-writing the top hit would put a stranger's rating and reviews on our
//  detail panel, and nothing downstream would ever flag it.
//
//  So: this prints the top few candidates with their address and coordinates,
//  plus a ready-to-paste UPDATE for the one that looks right. A human confirms
//  the match. Six properties makes that a two-minute job; the automation is
//  not worth the class of bug it invites.
//
//  Properties that legitimately have no listing keep tripadvisor_location_id
//  NULL, and the API returns 204 for them — the panel just renders without a
//  Tripadvisor block. That is a supported state, not a gap to fill.
// ============================================================================

import { createRequire } from 'node:module'

import '../../backend/env.js'

// `pg` lives in backend/node_modules, and an ESM bare specifier resolves from
// THIS file's directory (db/scripts/) upward — never from the cwd. So running
// the script from backend/ does not help it find the package. Anchor a require
// at backend/package.json and resolution starts there instead.
const require = createRequire(new URL('../../backend/package.json', import.meta.url))
const pg = require('pg')

const KEY = process.env.TRIPADVISOR_API_KEY
const REFERER = process.env.TRIPADVISOR_REFERER

// Two listing tables now carry a tripadvisor_location_id. The matching problem
// is identical for both, so this is a table swap rather than a second script.
// `category` is Tripadvisor's own filter — passing the wrong one is how a
// restaurant search starts returning hotels.
const TARGETS = {
  stays: { table: 'stay_listings', category: 'hotels', label: 'stay' },
  restaurants: { table: 'restaurant_listings', category: 'restaurants', label: 'restaurant' },
}

const MODE = process.argv.includes('--restaurants') ? 'restaurants' : 'stays'
const TARGET = TARGETS[MODE]

if (!KEY) {
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

/** Escape a value for a single-quoted SQL literal in the printed UPDATE. */
const q = (s) => String(s).replace(/'/g, "''")

async function search(stay) {
  const url = new URL('https://api.content.tripadvisor.com/api/v1/location/search')
  url.searchParams.set('key', KEY)
  url.searchParams.set('searchQuery', stay.name)
  url.searchParams.set('category', TARGET.category)
  if (stay.latitude != null && stay.longitude != null) {
    url.searchParams.set('latLong', `${stay.latitude},${stay.longitude}`)
  }

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      ...(REFERER ? { Referer: REFERER } : {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    // 403 here is almost always the key's IP/referer allowlist, not a bad
    // query — say so, because the message Tripadvisor returns does not.
    if (res.status === 403) {
      throw new Error(
        `403 from Tripadvisor. This host's IP is probably not on the key's ` +
          `allowlist (or the key is not Active). Body: ${body}`,
      )
    }
    throw new Error(`${res.status} from Tripadvisor: ${body}`)
  }

  const json = await res.json()
  return json.data ?? []
}

const { rows } = await pool.query(
  `SELECT id, name, latitude, longitude, location_area
     FROM ${TARGET.table}
    WHERE tripadvisor_location_id IS NULL AND is_active = true
    ORDER BY name`,
)

if (!rows.length) {
  console.log(`Every active ${TARGET.label} already has a tripadvisor_location_id. Nothing to do.`)
  await pool.end()
  process.exit(0)
}

console.log(`${rows.length} ${TARGET.label}(s) without a Tripadvisor id.\n`)

for (const stay of rows) {
  console.log('='.repeat(72))
  console.log(`${stay.name}  (id ${stay.id}, ${stay.location_area ?? 'area unknown'})`)
  console.log('='.repeat(72))

  let candidates
  try {
    candidates = await search(stay)
  } catch (e) {
    console.error(`  ! ${e.message}\n`)
    continue
  }

  if (!candidates.length) {
    console.log('  no candidates — leave the id NULL\n')
    continue
  }

  candidates.slice(0, 5).forEach((c, i) => {
    const a = c.address_obj ?? {}
    console.log(
      `  [${i + 1}] ${c.name}\n` +
        `      location_id: ${c.location_id}\n` +
        `      ${[a.street1, a.city, a.country].filter(Boolean).join(', ') || 'no address'}`,
    )
  })

  console.log(
    `\n  -- if [1] is correct:\n` +
      `  UPDATE ${TARGET.table} SET tripadvisor_location_id = '${q(candidates[0].location_id)}'\n` +
      `   WHERE name = '${q(stay.name)}';\n`,
  )
}

console.log(
  'Review each match above, then apply only the UPDATEs you are confident in.\n' +
    'Leave a property NULL rather than guessing — the panel handles NULL cleanly.',
)

await pool.end()
