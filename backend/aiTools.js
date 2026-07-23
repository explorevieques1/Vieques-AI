// ============================================================================
//  aiTools.js — Claude tool definitions + their database implementations
// ============================================================================
//
//  This module is the "hands" of the AI assistant. It has two exports that work
//  as a pair, consumed by the /api/ai/chat loop in server.js:
//
//    • TOOLS   — the JSON tool schemas Claude sees. Each entry tells the model
//                a tool's name, when to use it (description), and what inputs it
//                accepts (input_schema). Claude decides which to call.
//    • runTool — the server-side executor. Given a tool name + inputs, it runs
//                the matching SQL against Postgres and returns { listings, pins }.
//
//  DESIGN NOTE: descriptions are written FOR THE MODEL. They double as routing
//  hints ("use for 'rent a car', 'taxi', 'ferry'…") so Claude picks the right
//  tool from a vague question. Keep them concrete when editing.
// ============================================================================

/**
 * Tool schemas advertised to Claude. Passed straight into the Anthropic
 * `messages.create({ tools })` call in server.js.
 * @type {Array<{ name: string, description: string, input_schema: object }>}
 */
export const TOOLS = [
  {
    name: 'search_beaches',
    description:
      'Find beaches on Vieques. Use for any question about beaches, swimming, sand, family beaches, snorkeling beaches, secluded beaches, etc.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            "Optional beach type filter: 'family','snorkeling','secluded','swimming','surfing','scenic'.",
        },
      },
    },
  },
  {
    name: 'search_restaurants',
    description:
      'Find restaurants and places to eat or drink: food, dining, bars, cuisines (italian, mexican, seafood, vegan), breakfast, fine dining, waterfront dining.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            "Restaurant category slug: 'seafood','italian','mexican','vegan','breakfast','fine-dining','waterfront','bar-grill','local','casual'.",
        },
      },
    },
  },
  {
    name: 'search_transport',
    description:
      'Find transportation: car rentals, taxis, airlines, ferry, scooter/bike, water taxi. Use for "rent a car", "how do I get around", "taxi", "airport", "ferry".',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            "Transport slug: 'car-rental','taxis','airlines','ferry','scooter-bike','water-taxi'.",
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'search_activities',
    description:
      'Find activities and things to do: snorkeling, diving, kayaking, fishing, sailing, bio bay, horseback riding, sunsets, nightlife.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            "Activity slug: 'snorkeling','diving','kayaking','bio-bay','horseback-riding','sailing','fishing'.",
        },
      },
      required: ['category'],
    },
  },
]

/**
 * Execute one tool call against Postgres.
 *
 * Dispatches on the tool `name` Claude chose, runs the matching parameterized
 * query, and returns both the raw rows (for Claude to read) and map-ready pins
 * (for the frontend) via shape().
 *
 * @param {import('pg').Pool} pool  Shared DB pool from server.js.
 * @param {string} name             Tool name (must match a TOOLS entry).
 * @param {object} input            Validated inputs Claude supplied.
 * @returns {Promise<{ listings: object[], pins: object[] }>} Empty on unknown tool.
 */
export async function runTool(pool, name, input) {
  if (name === 'search_beaches') {
    const params = []
    let where = 'is_active = true'
    if (input.type) {
      // `type` is a Postgres array column; `&&` is the array-overlap operator,
      // so this matches any beach whose types include the requested one.
      params.push([input.type])
      where += ` AND type && $${params.length}`
    }
    const { rows } = await pool.query(
      `SELECT id, name, latitude, longitude, type, water_conditions,
              best_for, in_wildlife_refuge, notes
       FROM beaches WHERE ${where} ORDER BY name`,
      params,
    )
    return shape(rows, 'beach')
  }

  // Restaurants: category is optional. When present we join through the
  // category link tables; when absent we return every active restaurant.
  if (name === 'search_restaurants') {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.latitude, l.longitude, l.cuisine, l.price, l.phones, l.hours
       FROM restaurant_listings l
       ${
         input.category
           ? `JOIN restaurant_listing_categories lc ON lc.listing_id=l.id
              JOIN restaurant_categories c ON c.id=lc.category_id AND c.slug=$1`
           : ''
       }
       WHERE l.is_active = true ORDER BY l.name`,
      input.category ? [input.category] : [],
    )
    return shape(rows, 'restaurant')
  }

  if (name === 'search_transport') {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.latitude, l.longitude, l.phones, l.address, l.hours, l.has_location
       FROM transport_listings l
       JOIN transport_listing_categories lc ON lc.listing_id=l.id
       JOIN transport_categories c ON c.id=lc.category_id
       WHERE c.slug=$1 AND l.is_active=true ORDER BY l.name`,
      [input.category],
    )
    return shape(rows, 'transport')
  }

  if (name === 'search_activities') {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.latitude, l.longitude, l.phones, l.description
       FROM activity_listings l
       JOIN activity_listing_categories lc ON lc.listing_id=l.id
       JOIN activity_categories c ON c.id=lc.category_id
       WHERE c.slug=$1 AND l.is_active=true ORDER BY l.name`,
      [input.category],
    )
    return shape(rows, 'activity')
  }

  // Unknown tool name → nothing to return (server.js treats this as no results).
  return { listings: [], pins: [] }
}

/**
 * Split query rows into what Claude reads vs. what the map draws.
 *
 * `listings` is every row (Claude summarizes these in its reply). `pins` is the
 * subset that has real coordinates, normalized to the minimal shape the map
 * needs — id/name/kind/lat/lng — with `kind` tagging the source category so
 * the frontend can color/icon the marker.
 *
 * @param {object[]} rows  Raw query rows.
 * @param {string} kind    Category label ('beach','restaurant','transport','activity').
 * @returns {{ listings: object[], pins: object[] }}
 */
function shape(rows, kind) {
  const pins = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: String(r.id),
      name: r.name,
      kind,
      latitude: r.latitude,
      longitude: r.longitude,
    }))
  return { listings: rows, pins }
}
