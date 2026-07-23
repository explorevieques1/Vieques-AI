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
//    • Content routes         — beaches, restaurants, activities, transport,
//                               services, essentials, snorkel spots (read-only)
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
import { createCheckoutSession, handleWebhook, getEntitlement } from './payments.js'

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
        // Pinning search_path=public on connect fixes it for good.
        options: '-c search_path=public',
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

// Explicit allowlist. `.filter(Boolean)` drops LANDING_URL/APP_URL when unset
// so we never accidentally allow the string "undefined" as an origin.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.LANDING_URL,   // e.g. https://explorevieques.org
  process.env.APP_URL,       // e.g. https://app.explorevieques.org
].filter(Boolean)

// Dev-only: match any http://localhost:PORT or http://127.0.0.1:PORT origin.
// Returns false in production regardless of the URL shape.
const isDevLocalhost = (origin) =>
  !IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)

app.use(cors({
  origin(origin, cb) {
    // No origin header = same-origin request or a tool like curl → allow it.
    // Otherwise the origin must be on the allowlist (or a dev localhost port).
    if (!origin || ALLOWED_ORIGINS.includes(origin) || isDevLocalhost(origin)) return cb(null, true)
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
//  Everything below serves public map content from Supabase. No auth needed —
//  the paywall is enforced in the map app's AccessGate, not on these reads.
// ============================================================================

// All active beaches, shaped for the map + popup.
// Optional query filters:
//   ?type=snorkeling,family   (match ANY listed type)
//   ?water=calm               (exact water_conditions)
//   ?refuge=true|false        (in_wildlife_refuge)
//   ?facilities=restroom,parking  (facility text contains ANY keyword)
app.get('/api/beaches', async (req, res) => {
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

    const { rows } = await pool.query(
      `SELECT id, name, local_name, latitude, longitude,
              region, type, water_conditions, access, facilities,
              best_for, in_wildlife_refuge, gate_hours, notes
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
app.get('/api/activity-categories', async (_req, res) => {
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
app.get('/api/activities/:slug', async (req, res) => {
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
app.get('/api/snorkel-spots', async (_req, res) => {
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
app.get('/api/snorkel-spots/:id/zones', async (req, res) => {
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


// Service categories for the sidebar
app.get('/api/service-categories', async (_req, res) => {
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
app.get('/api/services/:slug', async (req, res) => {
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
app.get('/api/transport-categories', async (_req, res) => {
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
app.get('/api/transport/:slug', async (req, res) => {
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
app.get('/api/restaurant-categories', async (_req, res) => {
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
app.get('/api/restaurants/:slug', async (req, res) => {
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
    res.json(rows)
  } catch (e) {
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

app.post('/api/ai/chat', async (req, res) => {
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

    res.json({ reply: finalText || 'Sorry, I could not find an answer.', pins })
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
app.post('/api/directions', async (req, res) => {
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
app.get('/api/essential-categories', async (_req, res) => {
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
app.get('/api/essentials/:slug', async (req, res) => {
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