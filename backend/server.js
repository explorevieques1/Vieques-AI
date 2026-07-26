// ============================================================================
//  Explore Vieques — Backend API server
// ============================================================================
//
//  This is the ONLY process that talks to Postgres, Stripe, and Claude. The
//  browser (landing + map app) never touches those directly — every request
//  funnels through this "gatekeeper." That keeps secret keys server-side and
//  lets Row Level Security protect the identity/payment tables.
//
//  WHAT LIVES HERE
//  ---------------
//    • CORS policy          — who is allowed to call this API
//    • Postgres pool         — the single shared DB connection pool
//    • Stripe webhook mount   — raw-body route, registered before express.json()
//    • Content routes         — beaches, restaurants, stays, activities,
//                               transport, services, essentials, snorkel spots,
//                               hiking trails (read-only)
//    • Tripadvisor route      — /api/stays/:id/tripadvisor, a cached proxy for
//                               lodging ratings/photos (key stays server-side)
//    • Payment routes         — /api/checkout, /api/entitlement (see payments.js)
//    • AI chat route          — /api/ai/chat, a Claude tool-use loop (see aiTools.js)
//    • Directions route       — /api/directions, fuzzy place match + OSRM routing
//
//  RUNTIME / DEPLOYMENT (Railway)
//  ------------------------------
//    • Started with `npm start` → `node server.js` (see package.json).
//    • Listens on process.env.PORT (Railway injects it) or 3001 locally.
//    • Binds 0.0.0.0 so the container's health check can reach it.
//    • Health check: GET /api/health  (configured in backend/railway.json).
//    • Set NODE_ENV=production on the host — it tightens the CORS rule below.
//
//  See CLAUDE.md → "Deploy the backend to Railway" for the full runbook.
// ============================================================================

import './env.js'   // MUST be first — loads .env before any module reads process.env
import express from 'express'
import cors from 'cors'
import pg from 'pg'
import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, runTool } from './aiTools.js'
import { createCheckoutSession, handleWebhook, getEntitlement, tierHas } from './payments.js'
import { requireAuth, requireTier, requireCredits, rateLimit } from './middleware.js'

// ----------------------------------------------------------------------------
//  Third-party clients & app instance
// ----------------------------------------------------------------------------

// Claude client. The API key stays server-side; the browser never sees it.
// Falls back to '' so the process still boots if the key is missing — the AI
// route will fail per-request rather than crashing the whole server on start.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

const app = express()

// ----------------------------------------------------------------------------
//  Postgres connection pool
// ----------------------------------------------------------------------------
//  Defined early so the Stripe webhook route (registered below) can capture it.
//
//  Two shapes:
//    1. DATABASE_URL set  → Supabase transaction pooler (production path).
//    2. DATABASE_URL unset → discrete DB_* fields (local Postgres fallback).
// ----------------------------------------------------------------------------
const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Supabase terminates SSL at the pooler with a cert Node won't verify
        // by default; disabling verification is the documented, expected setup.
        ssl: { rejectUnauthorized: false },
        // GOTCHA (do not remove): Supabase's transaction pooler starts every
        // session with an EMPTY search_path, so unqualified names like
        // `FROM beaches` fail intermittently with `relation ... does not exist`.
        // Pinning search_path on connect fixes it for good.
        //
        // `extensions` is required as well, and is easy to miss because every
        // non-spatial route works without it. Supabase installs PostGIS into
        // the `extensions` schema, NOT public — so pinning `public` alone
        // makes unqualified ST_* calls fail with
        //   function st_asgeojson(extensions.geometry) does not exist
        // That silently broke /api/snorkel-spots/:id/zones (the only PostGIS
        // route at the time; the verified prod smoke test hit
        // /api/snorkel-spots, which reads plain lat/lng columns and so never
        // exercised it). /api/trails needs ST_AsGeoJSON too.
        //
        // public stays FIRST so unqualified table names keep resolving there.
        options: '-c search_path=public,extensions',
      }
    : {
        // Local Postgres fallback (only when DATABASE_URL is unset).
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'vieques_ai',
        user: process.env.DB_USER || 'vieques_app',
        password: process.env.DB_PASSWORD || '',
      }
)

// ----------------------------------------------------------------------------
//  CORS — who is allowed to call this API
// ----------------------------------------------------------------------------
//  Production: only the exact landing + app origins (plus localhost, harmless).
//  Development: any localhost port, because Vite bumps 5174→5175→5176… when a
//  port is busy and we don't want that to silently break local requests.
//
//  IMPORTANT: the dev-only "any localhost" escape hatch is gated on NODE_ENV.
//  Setting NODE_ENV=production on the deploy host disables it — do not skip it.
// ----------------------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === 'production'

// An origin and its www/apex twin. Vercel serves the landing site from
// www.explorevieques.org while the apex redirects to it, so a LANDING_URL set
// to either form must allow both — otherwise real browser traffic from the
// other form is rejected as an unknown origin.
//
//  Tolerant of how these get typed into a deploy dashboard: surrounding
//  whitespace, a trailing slash, or a bare host with no scheme all still
//  produce usable origins. A scheme-less value silently matched nothing before,
//  which reads as "CORS is broken" rather than "the variable has a typo".
const withWwwTwin = (raw) => {
  const url = raw?.trim().replace(/\/+$/, '')
  if (!url) return []
  try {
    const { protocol, host } = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`)
    const bare = host.replace(/^www\./, '')
    return [`${protocol}//${bare}`, `${protocol}//www.${bare}`]
  } catch {
    console.warn(`CORS: ignoring unparseable origin ${JSON.stringify(raw)}`)
    return []
  }
}

// Explicit allowlist. `.filter(Boolean)` drops LANDING_URL/APP_URL when unset
// so we never accidentally allow the string "undefined" as an origin.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...withWwwTwin(process.env.LANDING_URL),   // e.g. https://explorevieques.org
  ...withWwwTwin(process.env.APP_URL),       // e.g. https://app.explorevieques.org
].filter(Boolean)

// Print the effective allowlist at boot. A missing or misspelled LANDING_URL /
// APP_URL surfaces in the browser as an opaque CORS failure on every call; this
// line turns that into a one-glance check in the deploy host's logs.
console.log('CORS allowlist:', ALLOWED_ORIGINS.join(', '))
for (const [name, value] of [['LANDING_URL', process.env.LANDING_URL], ['APP_URL', process.env.APP_URL]]) {
  if (!value) console.warn(`CORS: ${name} is not set — browser calls from that origin will be rejected`)
}

// Dev-only: match any http://localhost:PORT or http://127.0.0.1:PORT origin.
// Returns false in production regardless of the URL shape.
const isDevLocalhost = (origin) =>
  !IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)

app.use(cors({
  origin(origin, cb) {
    // No origin header = same-origin request or a tool like curl → allow it.
    // Otherwise the origin must be on the allowlist (or a dev localhost port).
    if (!origin || ALLOWED_ORIGINS.includes(origin) || isDevLocalhost(origin)) return cb(null, true)
    // Log the rejection with the allowlist beside it. Without this the only
    // evidence is a 500 with no CORS headers, which looks identical to the
    // server being down.
    console.warn(`CORS: rejected origin ${origin} — allowed: ${ALLOWED_ORIGINS.join(', ')}`)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
}))

// ----------------------------------------------------------------------------
//  Stripe webhook — MUST be mounted BEFORE express.json()
// ----------------------------------------------------------------------------
//  Stripe signs the RAW request body. If express.json() parses it first, the
//  bytes change and signature verification fails 100% of the time. So this one
//  route uses express.raw() to keep the untouched Buffer. All fulfillment logic
//  (granting access/credits) lives in payments.js → handleWebhook().
// ----------------------------------------------------------------------------
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => handleWebhook(pool, req, res)
)

// Dev-only request log. Off in production, where the host already captures
// access logs and this would just double the noise.
//
// Worth keeping: the gated routes deliberately fail *quietly* at the client —
// a 402 from requireTier and a 204 from "no Tripadvisor listing" both render
// as an absent panel section, which is indistinguishable from a fetch that
// never happened. Without this line the only way to tell those three apart is
// to guess.
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.on('finish', () => console.log(`${res.statusCode} ${req.method} ${req.originalUrl}`))
    next()
  })
}

// From here down, every route parses its body as JSON.
app.use(express.json())

// ----------------------------------------------------------------------------
//  Health check — GET /api/health
// ----------------------------------------------------------------------------
//  Railway pings this after each deploy (railway.json → healthcheckPath). We
//  run a trivial `SELECT 1` so a green health check also proves the database
//  connection is live, not just that the process is up. Returns 500 if the DB
//  is unreachable, which tells Railway the deploy is unhealthy.
// ----------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ============================================================================
//  CONTENT ROUTES (read-only map data)
//  This data (beaches, restaurants, activities, transport, services,
//  essentials, snorkel spots) is the paid product, not marketing — every
//  route below requires a signed-in user with an active plan. Matching RLS
//  policies (see db/migrations/0019_gate_content_rls.sql) block anyone who
//  bypasses this API and queries Supabase directly with the anon key.
// ============================================================================

// All active beaches, shaped for the map + popup.
// Optional query filters:
//   ?type=snorkeling,family   (match ANY listed type)
//   ?water=calm               (exact water_conditions)
//   ?refuge=true|false        (in_wildlife_refuge)
//   ?facilities=restroom,parking  (facility text contains ANY keyword)
app.get('/api/beaches', requireAuth, requireTier(pool, 'beach_names'), async (req, res) => {
  try {
    const where = ['is_active = true']
    const params = []

    if (req.query.type) {
      const types = String(req.query.type).split(',').map((t) => t.trim()).filter(Boolean)
      if (types.length) {
        params.push(types)
        where.push(`type && $${params.length}`) // array overlap = matches ANY
      }
    }
    if (req.query.water) {
      params.push(String(req.query.water).trim())
      where.push(`water_conditions = $${params.length}`)
    }
    if (req.query.refuge === 'true' || req.query.refuge === 'false') {
      params.push(req.query.refuge === 'true')
      where.push(`in_wildlife_refuge = $${params.length}`)
    }
    if (req.query.facilities) {
      const kws = String(req.query.facilities).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
      if (kws.length) {
        // match if ANY facility string contains ANY keyword
        params.push(kws)
        where.push(`EXISTS (
          SELECT 1 FROM unnest(facilities) f
          WHERE f ILIKE ANY (SELECT '%' || kw || '%' FROM unnest($${params.length}::text[]) kw)
        )`)
      }
    }

    // The free tier gets pins and names, not the detail people pay for
    // (facilities, 4x4 access, conditions). Trimming here rather than 402-ing
    // is the whole point of the free tier — see PRICING.md §4.1: an empty map
    // sells nothing, a map with locked detail sells the upgrade.
    //
    // This is a column-level rule, which RLS cannot express — hence it lives
    // here rather than in 0022_tier_rls.sql. Safe because the backend pool
    // connects as the table owner and bypasses RLS anyway.
    const cols = tierHas(req.tier, 'beach_profiles')
      ? `id, name, local_name, latitude, longitude,
         region, type, water_conditions, access, facilities,
         best_for, in_wildlife_refuge, gate_hours, notes`
      : `id, name, latitude, longitude, region`

    const { rows } = await pool.query(
      `SELECT ${cols}
       FROM beaches
       WHERE ${where.join(' AND ')}
       ORDER BY name`,
      params,
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// Activity categories for the sidebar
app.get('/api/activity-categories', requireAuth, requireTier(pool, 'activities'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label FROM activity_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Listings (pins) for one activity slug
app.get('/api/activities/:slug', requireAuth, requireTier(pool, 'activities'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.phones, l.website, l.address,
              l.location_area, l.latitude, l.longitude, l.price_info, l.hours
       FROM activity_listings l
       JOIN activity_listing_categories lc ON lc.listing_id = l.id
       JOIN activity_categories c ON c.id = lc.category_id
       WHERE c.slug = $1 AND l.is_active = true
       ORDER BY l.name`,
      [req.params.slug]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// Self-guided snorkeling spots (pins)
app.get('/api/snorkel-spots', requireAuth, requireTier(pool, 'snorkel_zones'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, beach_id, description, difficulty, entry_notes,
              latitude, longitude, offers_tours
       FROM snorkel_spots
       WHERE is_active = true AND latitude IS NOT NULL
       ORDER BY name`
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Zones for one snorkel spot, returned as a GeoJSON FeatureCollection
app.get('/api/snorkel-spots/:id/zones', requireAuth, requireTier(pool, 'snorkel_zones'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, zone_type, color, description,
              ST_AsGeoJSON(area::geometry) AS geojson
       FROM snorkel_zones
       WHERE spot_id = $1
       ORDER BY sort_order`,
      [req.params.id]
    )
    const features = rows.map((r) => ({
      type: 'Feature',
      properties: {
        id: r.id,
        label: r.label,
        zone_type: r.zone_type,
        color: r.color,
        description: r.description,
      },
      geometry: JSON.parse(r.geojson),
    }))
    res.json({ type: 'FeatureCollection', features })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ----------------------------------------------------------------------------
//  Hiking trails
// ----------------------------------------------------------------------------
//  Returns ONE GeoJSON FeatureCollection rather than the array-of-rows shape
//  every other content route uses, because a trail's geometry IS the payload:
//  the map app hands the response straight to a MapLibre `geojson` source with
//  no reshaping (see frontend/src/lib/trailLayers.ts), and every trail's line
//  is needed up front to draw the layer — there is no per-trail second request
//  like /api/snorkel-spots/:id/zones does for zones.
//
//  Everything the info pane shows travels in `properties`, so the same
//  FeatureCollection feeds the list, the detail panel, and the line layer.
//
//  Derived server-side, never stored (see db/migrations/0025_trails.sql):
//    • distance_km / distance_mi — generated columns, measured off the geometry
//    • trailhead_lat / trailhead_lng — ST_StartPoint, so the app can pin, sort
//      by distance-from-you, and route to the start without its own geometry math
//
//  Gated on 'activities', so hiking is included from Day Trip up — the same
//  bundle as the rest of the things-to-do content.
// ----------------------------------------------------------------------------
app.get('/api/trails', requireAuth, requireTier(pool, 'activities'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, local_name, difficulty, surface, route_type,
              elevation_gain_m, est_minutes, region, best_time, shade,
              dogs_allowed, in_wildlife_refuge, gate_hours, warning,
              description, source, source_url,
              distance_km, distance_mi, published_distance_mi,
              ST_Y(ST_StartPoint(geom)) AS trailhead_lat,
              ST_X(ST_StartPoint(geom)) AS trailhead_lng,
              ST_AsGeoJSON(geom) AS geojson
       FROM trails
       WHERE is_active = true
       ORDER BY name`
    )
    const features = rows.map(({ geojson, ...properties }) => ({
      type: 'Feature',
      // Postgres returns numeric as a string to preserve precision. The UI
      // formats and sorts these, so coerce here rather than leaving "0.62"
      // to sort lexically or render as "0.62 km" via string concat by luck.
      properties: {
        ...properties,
        distance_km: properties.distance_km == null ? null : Number(properties.distance_km),
        distance_mi: properties.distance_mi == null ? null : Number(properties.distance_mi),
        published_distance_mi:
          properties.published_distance_mi == null ? null : Number(properties.published_distance_mi),
        elevation_gain_m:
          properties.elevation_gain_m == null ? null : Number(properties.elevation_gain_m),
      },
      geometry: JSON.parse(geojson),
    }))
    res.json({ type: 'FeatureCollection', features })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// Service categories for the sidebar
app.get('/api/service-categories', requireAuth, requireTier(pool, 'activities'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label FROM service_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Listings for one service slug. ?located=true returns only mappable ones.
app.get('/api/services/:slug', requireAuth, requireTier(pool, 'activities'), async (req, res) => {
  try {
    const onlyLocated = req.query.located === 'true'
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.phones, l.email, l.website,
              l.address, l.location_area, l.latitude, l.longitude,
              l.has_location, l.hours
       FROM service_listings l
       JOIN service_listing_categories lc ON lc.listing_id = l.id
       JOIN service_categories c ON c.id = lc.category_id
       WHERE c.slug = $1 AND l.is_active = true
       ${onlyLocated ? 'AND l.has_location = true' : ''}
       ORDER BY l.name`,
      [req.params.slug]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ============================================================================
//  PAYMENT ROUTES  (implementation lives in payments.js)
// ============================================================================

// POST /api/checkout — start a Stripe Checkout session for the requested plan.
// Requires a signed-in user (Bearer JWT); returns a hosted-checkout URL.
app.post('/api/checkout', (req, res) => createCheckoutSession(pool, req, res))

// GET /api/entitlement — the map app's paywall asks this "can this user in?"
// Returns { hasAccess, plans, credits } for the signed-in user.
app.get('/api/entitlement', (req, res) => getEntitlement(pool, req, res))


// Transportation categories for the sidebar
app.get('/api/transport-categories', requireAuth, requireTier(pool, 'transport'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label, is_physical FROM transport_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Listings for one transport slug. Includes taxi metadata and, for car
// rentals, the vehicle fleet (aggregated as JSON).
app.get('/api/transport/:slug', requireAuth, requireTier(pool, 'transport'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.phones, l.email, l.website,
              l.address, l.location_area, l.latitude, l.longitude,
              l.has_location, l.hours, l.metadata,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'make', v.make, 'model', v.model,
                   'doors', v.doors, 'passengers', v.passengers
                 ) ORDER BY v.sort_order)
                 FROM transport_vehicles v WHERE v.listing_id = l.id),
                '[]'::json
              ) AS vehicles
       FROM transport_listings l
       JOIN transport_listing_categories lc ON lc.listing_id = l.id
       JOIN transport_categories c ON c.id = lc.category_id
       WHERE c.slug = $1 AND l.is_active = true
       ORDER BY l.name`,
      [req.params.slug]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// Restaurant categories for the sidebar
app.get('/api/restaurant-categories', requireAuth, requireTier(pool, ['restaurant_preview', 'restaurants']), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label FROM restaurant_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Listings for one restaurant category slug
app.get('/api/restaurants/:slug', requireAuth, requireTier(pool, ['restaurant_preview', 'restaurants']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.phones, l.cuisine, l.price,
              l.hours, l.email, l.website, l.address, l.location_area,
              l.latitude, l.longitude, l.has_location
       FROM restaurant_listings l
       JOIN restaurant_listing_categories lc ON lc.listing_id = l.id
       JOIN restaurant_categories c ON c.id = lc.category_id
       WHERE c.slug = $1 AND l.is_active = true
       ORDER BY l.name`,
      [req.params.slug]
    )
    // Free tier sees a 3-listing taste of each category (PRICING.md §4:
    // "Restaurant profiles — 3 preview"). Paid tiers get the full list.
    res.json(tierHas(req.tier, 'restaurants') ? rows : rows.slice(0, 3))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// ============================================================================
//  STAYS — lodging listings + their Tripadvisor enrichment
// ============================================================================
//  Three routes, with deliberately different gates:
//
//    GET /api/stay-categories        → stay_preview (free) or stays (paid)
//    GET /api/stays                  → stay_preview (free) or stays (paid)
//    GET /api/stays/:id/tripadvisor  → stays only
//
//  The free tier gets a 3-property taste of the list but no Tripadvisor
//  content at all. That is not only a paywall line: every uncached call to
//  the Content API costs quota, and spending it on users who cannot see the
//  full list is the wrong trade.
// ============================================================================

// Categories for the chip row (0028_stay_categories.sql). Gated with the list
// itself: the chips leak nothing the list does not, and hiding them from the
// free tier would make the panel look broken rather than gated.
app.get('/api/stay-categories', requireAuth, requireTier(pool, ['stay_preview', 'stays']), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label FROM stay_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// All lodging in one shot, or one category of it via ?category=<slug>.
//
// The filter is a query param on the list route rather than a
// /api/stays/:slug of its own, the way restaurants do it, because for stays
// the unfiltered list is the default view and not a state you pass through —
// there are ~6 properties island-wide. `/api/stays/:id/tripadvisor` also
// already owns the `/api/stays/:something` shape.
app.get('/api/stays', requireAuth, requireTier(pool, ['stay_preview', 'stays']), async (req, res) => {
  try {
    const category = req.query.category || null
    // NOTE: tripadvisor_location_id is deliberately NOT selected. It is a
    // server-side join key; keeping it off the wire means the enrichment route
    // resolves it from our own row and enforces its own tier gate, rather than
    // trusting an id the browser hands back.
    const { rows } = await pool.query(
      `SELECT id, name, local_name, description, property_type,
              sleeps, bedrooms, bathrooms, unit_count,
              price_band, nightly_min, nightly_max, price_note, min_nights, currency,
              check_in, check_out, pets_allowed, accessible, amenities,
              phones, email, website, booking_url, hours, images, image_credit,
              latitude, longitude, has_location,
              address, location_area, location_precision, directions_note
         FROM stay_listings
        WHERE is_active = true
          AND ($1::text IS NULL OR category_slug = $1)
        ORDER BY name`,
      [category]
    )
    res.json(tierHas(req.tier, 'stays') ? rows : rows.slice(0, 3))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const TA_BASE = 'https://api.content.tripadvisor.com/api/v1'
/** Tripadvisor's licence permits only short-term caching; 24h is also a sane
 *  refresh rate for a rating that moves a few reviews a week. */
const TA_CACHE_TTL_HOURS = 24

/** One Content API GET. Returns parsed JSON, or throws with the status. */
async function tripadvisorGet(path, params) {
  const url = new URL(`${TA_BASE}${path}`)
  url.searchParams.set('key', process.env.TRIPADVISOR_API_KEY || '')
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v)

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      // The key may be restricted by HTTP referer rather than by IP — which is
      // the only workable option on a host without a stable egress IP, as
      // Railway is. Harmless when the key uses an IP allowlist instead.
      ...(process.env.TRIPADVISOR_REFERER ? { Referer: process.env.TRIPADVISOR_REFERER } : {}),
    },
  })
  if (!res.ok) {
    const err = new Error(`Tripadvisor ${res.status}: ${await res.text()}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

/**
 * Project Tripadvisor's response down to what the panel renders.
 *
 * Never pass their raw JSON through: it is large, it changes shape between
 * location types, and the client would then depend on fields we never agreed
 * to. `rating_image_url` and `web_url` are not optional extras — the Content
 * API terms require displaying their rating image and linking back to the
 * listing wherever the content appears.
 */
function shapeTripadvisor(details, photos, reviews) {
  return {
    location_id: details.location_id,
    name: details.name,
    // Tripadvisor sends every number as a string ("4.9", "236", "18.097452").
    // Number() at the boundary so the client never has to remember that.
    latitude: details.latitude != null ? Number(details.latitude) : null,
    longitude: details.longitude != null ? Number(details.longitude) : null,
    rating: details.rating != null ? Number(details.rating) : null,
    num_reviews: details.num_reviews != null ? Number(details.num_reviews) : null,
    ranking_string: details.ranking_data?.ranking_string ?? null,
    price_level: details.price_level ?? null,
    web_url: details.web_url ?? null,
    rating_image_url: details.rating_image_url ?? null,
    awards: (details.awards || []).slice(0, 2).map((a) => a.display_name).filter(Boolean),
    photos: (photos || [])
      .map((p) => ({
        thumbnail: p.images?.thumbnail?.url ?? null,
        large: p.images?.large?.url ?? p.images?.original?.url ?? null,
        caption: p.caption || null,
        // Attribution is a licence requirement, not decoration.
        credit: p.source?.name || null,
      }))
      .filter((p) => p.large || p.thumbnail),
    // Free tier returns at most 5 reviews and does not page. `url` is required:
    // the licence permits showing review text only alongside a link to that
    // review on Tripadvisor.
    reviews: (reviews || [])
      .map((r) => ({
        id: String(r.id),
        title: r.title || null,
        text: r.text || null,
        rating: r.rating != null ? Number(r.rating) : null,
        published_date: r.published_date || null,
        trip_type: r.trip_type || null,
        url: r.url || null,
        author: r.user?.username || null,
      }))
      .filter((r) => r.text),
  }
}

// GET /api/stays/:id/tripadvisor — live rating, reviews and photos for one stay.
//
// Returns 204 when the property has no Tripadvisor listing (a rental
// collective generally does not). That is a normal state, not an error: the
// client renders the panel without the Tripadvisor block.
app.get('/api/stays/:id/tripadvisor', requireAuth, requireTier(pool, 'stays'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT tripadvisor_location_id FROM stay_listings WHERE id = $1 AND is_active = true',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'No such stay.' })

    const locationId = rows[0].tripadvisor_location_id
    if (!locationId) return res.status(204).end()

    // --- cache read -------------------------------------------------------
    const cached = await pool.query(
      `SELECT payload, fetched_at,
              fetched_at > now() - ($2 || ' hours')::interval AS fresh
         FROM tripadvisor_cache WHERE location_id = $1`,
      [locationId, String(TA_CACHE_TTL_HOURS)]
    )
    if (cached.rows.length && cached.rows[0].fresh) {
      return res.json({ ...cached.rows[0].payload, fetched_at: cached.rows[0].fetched_at })
    }

    if (!process.env.TRIPADVISOR_API_KEY) {
      // Serve stale rather than nothing when the key is missing entirely.
      if (cached.rows.length) {
        return res.json({ ...cached.rows[0].payload, fetched_at: cached.rows[0].fetched_at })
      }
      return res.status(204).end()
    }

    // --- upstream ---------------------------------------------------------
    let details
    try {
      details = await tripadvisorGet(`/location/${locationId}/details`, {
        language: 'en',
        currency: 'USD',
      })
    } catch (e) {
      if (e.status === 403) {
        console.error(
          'Tripadvisor 403 — the caller is denied at their gateway. This is ' +
            'almost always the key\'s IP/referer allowlist (set TRIPADVISOR_REFERER, ' +
            'or add the host IP in the Content API portal) or a key that is not ' +
            'Active. It is NOT a bad location_id.',
          e.message
        )
      } else {
        console.error('Tripadvisor details failed:', e.message)
      }
      // A stale cache entry beats a blank panel — a day-old rating is still
      // worth more to a traveller than an error state.
      if (cached.rows.length) {
        return res.json({ ...cached.rows[0].payload, fetched_at: cached.rows[0].fetched_at })
      }
      return res.status(502).json({ error: 'Tripadvisor is unavailable right now.' })
    }

    // Photos and reviews are nice-to-haves; losing either must not lose the
    // rating too. Fetched in parallel — they are independent calls and the
    // panel waits on both, so serialising them just doubles the latency.
    const [photos, reviews] = await Promise.all(
      ['photos', 'reviews'].map(async (kind) => {
        try {
          const r = await tripadvisorGet(`/location/${locationId}/${kind}`, {
            limit: '5',
            language: 'en',
          })
          return r.data ?? []
        } catch (e) {
          console.error(`Tripadvisor ${kind} failed (continuing without them):`, e.message)
          return []
        }
      }),
    )

    const payload = shapeTripadvisor(details, photos, reviews)

    await pool.query(
      `INSERT INTO tripadvisor_cache (location_id, payload, fetched_at)
            VALUES ($1, $2, now())
       ON CONFLICT (location_id)
       DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
      [locationId, payload]
    )

    res.json({ ...payload, fetched_at: new Date().toISOString() })
  } catch (e) {
    console.error('Stay Tripadvisor error:', e)
    res.status(500).json({ error: e.message })
  }
})


// ============================================================================
//  AI CHAT ROUTE — POST /api/ai/chat
// ============================================================================
//  A Claude tool-use loop: the model calls the search tools defined in
//  aiTools.js, we run them against Postgres, feed the rows back, and repeat
//  until Claude produces a final text answer. The places it looked up are
//  returned as `pins` so the map app can drop them on the map.
//
//  Body:    { messages: [{ role, content }, ...] }
//  Returns: { reply: string, pins: [{ id, name, kind, latitude, longitude }] }
//
//  DEPLOYMENT NOTE: this loop can take 10–60+ seconds, which is WHY the backend
//  runs on an always-on host (Railway) instead of a serverless platform whose
//  request timeout would cut it off. See CLAUDE.md.
// ============================================================================

// The system prompt keeps answers grounded in tool output and formatted for the
// narrow mobile chat pane (no Markdown tables, short bulleted lists).
const SYSTEM_PROMPT = `You are the Vieques AI assistant, a friendly local guide for the island of Vieques, Puerto Rico. Help visitors find beaches, restaurants, activities, and transportation.

When a user asks about something, use the provided tools to look up real data from the database, then answer naturally and concisely based ONLY on what the tools return. Never invent places that the tools did not return. If a tool returns nothing, say you do not have that listed yet.

FORMATTING RULES (important — your answer shows in a narrow mobile chat pane):
- Do NOT use Markdown tables. Never use the | character for tables.
- Present lists of places as short bullet points, one per line, like: "- **Name** — 787-555-1234".
- Keep the whole reply brief. A one-sentence intro, then the list, then at most one short tip.
- Use **bold** only for place names. Avoid headings.
- The places you mention also appear as pins on the map, so you don't need to repeat addresses.`

// Gated on CREDITS, not entitlement. Entitlement is wrong in both directions
// here: Day Trip holds an active subscription but is allocated 0 AI messages,
// while the free tier holds no subscription but gets 3. Only the ledger balance
// answers "may this person ask a question?" correctly.
app.post('/api/ai/chat',
  requireAuth,
  requireCredits(pool),
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res) => {
  try {
    const userMessages = Array.isArray(req.body?.messages) ? req.body.messages : []
    if (!userMessages.length) return res.status(400).json({ error: 'No messages' })

    const messages = [...userMessages]   // running transcript we extend each turn
    const allPins = []                    // every place any tool surfaced
    let finalText = ''                    // Claude's latest natural-language reply

    // Tool-use loop. Capped at 5 turns so a misbehaving model can't spin
    // forever racking up token cost or hanging the request.
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })

      // Capture any prose Claude wrote this turn (kept as the reply if the
      // model stops here).
      const textParts = response.content.filter((c) => c.type === 'text').map((c) => c.text)
      if (textParts.length) finalText = textParts.join('\n')

      // No tool calls → Claude has finished reasoning; exit the loop.
      const toolUses = response.content.filter((c) => c.type === 'tool_use')
      if (toolUses.length === 0) break

      // Echo the assistant turn back into the transcript, then run each tool and
      // return its rows as tool_result messages so Claude can read them next turn.
      messages.push({ role: 'assistant', content: response.content })
      const toolResults = []
      for (const tu of toolUses) {
        const { listings, pins } = await runTool(pool, tu.name, tu.input || {})
        allPins.push(...pins)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          // Cap payload size so a huge result set can't blow the context window.
          content: JSON.stringify(listings).slice(0, 6000),
        })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    // De-dupe pins by "kind:id" so a place mentioned by two tools maps once.
    const seen = new Set()
    const pins = allPins.filter((p) => {
      const k = p.kind + ':' + p.id
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // Meter the message only now that we have an answer to hand back. Deducting
    // up front would charge the user for our outage — an Anthropic 500, a
    // timeout, or a tool-loop bug would silently eat their allowance.
    //
    // The ledger is append-only: this negative row IS the deduction, and
    // credit_balances is SUM(amount) over it. No balance column to race on.
    await pool.query(
      `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
       VALUES ($1, -1, 'ai_query', $2)`,
      [req.user.id, `chat_${Date.now()}`],
    )

    // Read the balance back in a separate statement rather than a RETURNING
    // subquery — a subquery in RETURNING runs against the statement's start
    // snapshot, so it would report the balance BEFORE the deduction.
    const { rows: bal } = await pool.query(
      'SELECT balance FROM public.credit_balances WHERE user_id = $1',
      [req.user.id],
    )

    res.json({
      reply: finalText || 'Sorry, I could not find an answer.',
      pins,
      // Lets the chat pane show "12 messages left" without a second round trip.
      creditsRemaining: Number(bal[0]?.balance ?? 0),
    })
  } catch (e) {
    console.error('AI chat error:', e)
    res.status(500).json({ error: e.message })
  }
})


// ============================================================================
//  DIRECTIONS ROUTE — POST /api/directions
// ============================================================================

/**
 * Resolve a free-typed place name to a real listing + coordinates.
 *
 * Searches every mapped table at once (beaches, restaurants, transport,
 * services, activities) using pg_trgm `similarity()` over unaccented,
 * lower-cased names — so "esperanza" matches "Esperanza" and "malecon"
 * matches "Malecón". Requires similarity > 0.15 to count as a hit.
 *
 * @param {string} term  The name the user typed.
 * @returns {Promise<{name, latitude, longitude, kind}|null>} Best match, or null.
 */
async function resolvePlace(term) {
  const { rows } = await pool.query(
    `WITH q AS (SELECT unaccent(lower($1)) AS t)
     SELECT name, latitude, longitude, kind,
            similarity(unaccent(lower(name)), (SELECT t FROM q)) AS sim
     FROM (
       SELECT name, latitude, longitude, 'beach' AS kind FROM beaches WHERE latitude IS NOT NULL AND is_active = true
       UNION ALL SELECT name, latitude, longitude, 'restaurant' FROM restaurant_listings WHERE latitude IS NOT NULL AND is_active = true
       UNION ALL SELECT name, latitude, longitude, 'transport'  FROM transport_listings  WHERE latitude IS NOT NULL AND is_active = true
       UNION ALL SELECT name, latitude, longitude, 'service'    FROM service_listings    WHERE latitude IS NOT NULL AND is_active = true
       UNION ALL SELECT name, latitude, longitude, 'activity'   FROM activity_listings   WHERE latitude IS NOT NULL AND is_active = true
     ) s
     WHERE similarity(unaccent(lower(name)), (SELECT t FROM q)) > 0.15
     ORDER BY sim DESC LIMIT 1`,
    [term],
  )
  return rows[0] || null
}

// POST /api/directions — turn two typed place names into a drivable route.
// Resolves each name to coordinates, asks the free public OSRM router for a
// driving route, and returns the geometry + distance/time + a Google Maps link.
// Body: { from: string, to: string }
app.post('/api/directions', requireAuth, requireTier(pool, 'directions'), async (req, res) => {
  try {
    const from = String(req.body?.from || '').trim()
    const to = String(req.body?.to || '').trim()
    if (!from || !to) return res.status(400).json({ error: 'Need both from and to.' })

    const a = await resolvePlace(from)
    const b = await resolvePlace(to)
    if (!a) return res.status(404).json({ error: `Couldn't find a place matching "${from}".` })
    if (!b) return res.status(404).json({ error: `Couldn't find a place matching "${to}".` })

    const coords = `${a.longitude},${a.latitude};${b.longitude},${b.latitude}`
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    const osrm = await fetch(url).then((r) => r.json())
    if (osrm.code !== 'Ok' || !osrm.routes?.length) {
      return res.status(502).json({ error: 'Could not compute a route.' })
    }
    const route = osrm.routes[0]

    res.json({
      from: { name: a.name, kind: a.kind, latitude: a.latitude, longitude: a.longitude },
      to:   { name: b.name, kind: b.kind, latitude: b.latitude, longitude: b.longitude },
      distance_m: route.distance,
      duration_s: route.duration,
      geometry: route.geometry, // GeoJSON LineString
      google_maps_url: `https://www.google.com/maps/dir/?api=1&origin=${a.latitude},${a.longitude}&destination=${b.latitude},${b.longitude}`,
    })
  } catch (e) {
    console.error('Directions error:', e)
    res.status(500).json({ error: e.message })
  }
})


// Essential service categories for the sidebar
app.get('/api/essential-categories', requireAuth, requireTier(pool, 'essentials'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, label FROM essential_categories ORDER BY sort_order'
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Listings for one essential category slug
app.get('/api/essentials/:slug', requireAuth, requireTier(pool, 'essentials'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.phones, l.email, l.website,
              l.address, l.location_area, l.latitude, l.longitude,
              l.has_location, l.hours
       FROM essential_listings l
       JOIN essential_listing_categories lc ON lc.listing_id = l.id
       JOIN essential_categories c ON c.id = lc.category_id
       WHERE c.slug = $1 AND l.is_active = true
       ORDER BY l.name`,
      [req.params.slug]
    )
    res.json(rows)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ----------------------------------------------------------------------------
//  Start the server
// ----------------------------------------------------------------------------
//  PORT comes from the host (Railway injects it) and falls back to 3001 locally
//  — do NOT hardcode or set PORT in the deploy env. Binding 0.0.0.0 (not
//  127.0.0.1) is required so the container's health check and public networking
//  can reach the process, and it also makes the dev server reachable from other
//  devices on your LAN.
// ----------------------------------------------------------------------------
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () =>
  console.log(`API listening on http://0.0.0.0:${PORT} (reachable on your network IP too)`),
)