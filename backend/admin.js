/**
 * Admin data-entry routes — /api/admin/*
 *
 * LOCAL-ONLY: never mounted in production, and refuses non-loopback callers —
 * see "Local-only lock" below. Use it at http://localhost:5174/admin.
 *
 * Powers the owner's data-entry page. It exists so
 * content can be filled in without the Supabase Table Editor, which shows raw
 * Postgres arrays, raw jsonb and numeric join-table ids.
 *
 * WHO CAN CALL IT
 * ---------------
 * requireAuth (valid Supabase JWT) AND the user's id is listed in the
 * ADMIN_USER_IDS env var (comma-separated). If ADMIN_USER_IDS is unset every
 * call is refused — fail closed. The landing page's own check is cosmetic; this
 * is the real gate.
 *
 * WHY THE TABLE/COLUMN NAMES ARE SAFE TO INTERPOLATE
 * --------------------------------------------------
 * The browser sends a `kind` key ("restaurants"), never a table name. Every
 * identifier in the SQL below comes from the KINDS config in this file; an
 * unknown kind is a 404 before any SQL runs. Values always go through $n
 * parameters. Do not add a code path that takes a column name from the request.
 *
 * WHAT THE DB DOES FOR US
 * -----------------------
 * Each *_listings table has a BEFORE INSERT/UPDATE trigger (*_set_geom) that
 * rebuilds `geom`, sets has_location and bumps updated_at from lat/lng. So the
 * editor writes plain columns only and never touches geom.
 *
 * No DELETE route on purpose: hiding a listing is `is_active = false`, which is
 * reversible. Real deletes stay a deliberate SQL action.
 */
import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { requireAuth, rateLimit } from './middleware.js'
import { fail } from './httpError.js'
import { normalizeAnswer } from './cards.js'

const execFileP = promisify(execFile)

// --- Field sets ---------------------------------------------------------------
// type drives both server-side coercion and the form widget the page renders:
//   text | longtext | int | number | bool | list (Postgres text[]) | lat | lng
//   | url | email | select (options from `options`) | schedule (jsonb object)
//   | slug | hours (int4range, "19-24") | date (timestamptz, PR midnight)
//   | rule (achievement rule: "beach x5" or "monte-pirata + cerro-el-buey")
// extra: required, nullable, default (used when blank), placeholder (shown in
// the empty input), side (column in the kind's side table — see sideJoin).
const f = (name, type = 'text', extra = {}) => ({ name, type, ...extra })

const CONTACT = [
  f('phones', 'list'), f('email', 'email'), f('website', 'url'),
  f('address'), f('location_area'), f('latitude', 'lat'), f('longitude', 'lng'),
  f('hours', 'longtext'),
]

const LISTING_BASE = [f('name', 'text', { required: true }), f('description', 'longtext'), ...CONTACT]

/**
 * Every editable kind. How categories are stored varies:
 *   joinTable      — many-to-many via a join table (most kinds)
 *   categoryColumn — one slug column on the listing (stays)
 *   tagColumn      — a text[] of tags on the listing (beaches.type), with
 *                    tagOptions = the chips the map app shows
 * How photos are stored varies too:
 *   default             — the listing's own images text[] column
 *   photoStore: 'table' — public.photos rows (beaches). The app reads photos
 *                         first and only falls back to beaches.images, so
 *                         beach photos MUST go to the table or they won't show.
 */
export const KINDS = {
  beaches: {
    label: 'Beaches', table: 'beaches',
    tagColumn: 'type',
    // Mirrors BEACH_SUBCATEGORIES in frontend/src/hooks/useCategoryPlaces.ts;
    // any other tag already in the data is appended by /config.
    tagOptions: [
      { slug: 'swimming', label: 'Swimming' }, { slug: 'snorkeling', label: 'Snorkeling' },
      { slug: 'family', label: 'Family' }, { slug: 'secluded', label: 'Secluded' },
      { slug: 'scenic', label: 'Scenic' }, { slug: 'hiking', label: 'Hike-in' },
    ],
    photoStore: 'table',
    fields: [
      f('name', 'text', { required: true }), f('local_name'), f('region'),
      f('latitude', 'lat', { required: true }), f('longitude', 'lng', { required: true }),
      f('best_for'), f('gate_hours'), f('in_wildlife_refuge', 'bool'),
      f('water_conditions', 'longtext'), f('access', 'longtext'),
      f('facilities', 'list'), f('notes', 'longtext'),
      f('images', 'photos'), f('image_credit'),
    ],
  },
  transport: {
    label: 'Transport', table: 'transport_listings',
    catTable: 'transport_categories', joinTable: 'transport_listing_categories',
    fields: [...LISTING_BASE, f('metadata', 'schedule')],
    geoBox: 'EAST_PR', // ferry terminal / airports are off-island
  },
  restaurants: {
    label: 'Restaurants', table: 'restaurant_listings',
    catTable: 'restaurant_categories', joinTable: 'restaurant_listing_categories',
    // images / image_credit arrive with migration 0053; dropped at mount if absent.
    fields: [...LISTING_BASE, f('cuisine'), f('price'), f('tripadvisor_location_id'),
      f('images', 'photos'), f('image_credit')],
  },
  activities: {
    label: 'Activities', table: 'activity_listings',
    catTable: 'activity_categories', joinTable: 'activity_listing_categories',
    fields: [...LISTING_BASE, f('price_info'), f('images', 'photos'), f('image_credit')],
  },
  essentials: {
    label: 'Essentials', table: 'essential_listings',
    catTable: 'essential_categories', joinTable: 'essential_listing_categories',
    fields: LISTING_BASE,
  },
  services: {
    label: 'Services', table: 'service_listings',
    catTable: 'service_categories', joinTable: 'service_listing_categories',
    fields: LISTING_BASE,
  },
  stays: {
    label: 'Stays', table: 'stay_listings',
    catTable: 'stay_categories', categoryColumn: 'category_slug',
    fields: [
      f('name', 'text', { required: true }), f('local_name'), f('description', 'longtext'),
      f('property_type'), f('sleeps', 'int'), f('bedrooms', 'int'), f('bathrooms', 'number'),
      f('price_band'), f('nightly_min', 'number'), f('nightly_max', 'number'), f('price_note'),
      f('min_nights', 'int'), f('check_in'), f('check_out'),
      f('pets_allowed', 'bool', { nullable: true }), f('amenities', 'list'),
      f('booking_url', 'url'), f('images', 'photos'), f('image_credit'),
      ...CONTACT, f('directions_note', 'longtext'), f('tripadvisor_location_id'),
    ],
  },
  // Vieques Cards (migration 0055). Tags drive achievements, so they use the
  // beach-style chips. The riddle lives in card_challenges (keyed by card_id,
  // so it can't be a kind of its own) — edited here as four riddle_* fields
  // that loadRows joins in and saveSide writes back.
  cards: {
    label: 'Cards', table: 'collectible_cards',
    tagColumn: 'tags', categoryLabel: 'Tags',
    tagOptions: [
      { slug: 'beach', label: 'Beach' }, { slug: 'heights', label: 'Heights' },
      { slug: 'lighthouse', label: 'Lighthouse' }, { slug: 'history', label: 'History' },
      { slug: 'nature', label: 'Nature' }, { slug: 'coast', label: 'Coast' },
      { slug: 'town', label: 'Town' }, { slug: 'night', label: 'Night' },
      { slug: 'water', label: 'Water' },
    ],
    fields: [
      f('name', 'text', { required: true }),
      f('slug', 'slug', { required: true, placeholder: 'monte-pirata (never change once live)' }),
      f('rarity', 'select', { required: true, options: ['common', 'basic', 'rare', 'legendary'] }),
      f('region', 'text', { required: true, placeholder: 'Esperanza, Isabel II, Sun Bay, West, East, Central…' }),
      f('latitude', 'lat', { required: true }), f('longitude', 'lng', { required: true }),
      f('radius_m', 'int', { default: 75, placeholder: '75 — pier end ~30, summit ~60, open beach ~120' }),
      f('reveal_radius_m', 'int', { default: 200, placeholder: '200 — when it pops onto the map' }),
      f('place_id', 'text', { placeholder: 'beach:3 — optional link to a map place' }),
      f('lore', 'longtext'),
      f('hint', 'text', { placeholder: 'Shown before it’s found, e.g. “the island’s oldest tree”' }),
      f('image_path', 'url', { placeholder: 'https://… card art' }),
      f('active_hours', 'hours', { placeholder: '19-24 (Puerto Rico time) — blank = any time' }),
      f('max_claims', 'int', { placeholder: 'blank = unlimited, 50 = “#7 of 50”' }),
      f('starts_at', 'date'), f('ends_at', 'date'),
      f('sort', 'int', { default: 0 }),
      // 0056: only CARD_TESTER_IDS see it, and it may sit off-island.
      f('test_only', 'bool'),
      f('riddle_kind', 'select', { side: 'kind', options: ['locate', 'on_site'] }),
      f('riddle_prompt', 'longtext', { side: 'prompt' }),
      f('riddle_answers', 'list', { side: 'answers' }),
      f('riddle_hint', 'text', { side: 'hint', placeholder: 'Shown after 3 wrong guesses' }),
    ],
    sideJoin: 'LEFT JOIN card_challenges s ON s.card_id = l.id',
    saveSide: (...args) => saveRiddle(...args),
  },
  achievements: {
    label: 'Achievements', table: 'achievements', noCategories: true, timestampColumn: 'created_at',
    fields: [
      f('name', 'text', { required: true }),
      f('slug', 'slug', { required: true, placeholder: 'beach-bum' }),
      f('description', 'longtext'),
      f('rule', 'rule', { required: true, placeholder: 'beach x5   or   monte-pirata + cerro-el-buey' }),
      f('points', 'int', { default: 10 }),
      f('badge_path', 'url', { placeholder: 'https://… badge art' }),
      f('sort', 'int', { default: 0 }),
      f('test_only', 'bool'), // 0056: listed + awarded only to CARD_TESTER_IDS
    ],
  },
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Error whose message is safe to show the admin as a 400. */
const userError = (msg) => Object.assign(new Error(msg), { userFacing: true })

/**
 * Write a card's riddle (card_challenges) from the editor's riddle_* fields.
 * PATCH is partial, so merge with what's stored before validating. A blank
 * riddle_kind removes the riddle. Answers are stored normalised — the claim
 * and solve routes compare normalizeAnswer(input) against them verbatim.
 */
async function saveRiddle(client, cardId, side) {
  const { rows } = await client.query(
    `SELECT kind, prompt, answers, hint FROM card_challenges WHERE card_id = $1`, [cardId],
  )
  const cur = rows[0]
    ? { riddle_kind: rows[0].kind, riddle_prompt: rows[0].prompt, riddle_answers: rows[0].answers, riddle_hint: rows[0].hint }
    : {}
  const next = { ...cur, ...side }
  if (!next.riddle_kind) {
    await client.query(`DELETE FROM card_challenges WHERE card_id = $1`, [cardId])
    return
  }
  const answers = [...new Set((next.riddle_answers || []).map(normalizeAnswer).filter(Boolean))]
  if (!next.riddle_prompt) throw userError('A riddle needs a prompt (the question)')
  if (!answers.length) throw userError('A riddle needs at least one accepted answer')
  await client.query(
    `INSERT INTO card_challenges (card_id, kind, prompt, answers, hint)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (card_id) DO UPDATE
       SET kind = EXCLUDED.kind, prompt = EXCLUDED.prompt,
           answers = EXCLUDED.answers, hint = EXCLUDED.hint`,
    [cardId, next.riddle_kind, next.riddle_prompt, answers, next.riddle_hint || null],
  )
}

/** Pull side-table fields (riddle_*) out of the column values. */
function takeSide(kind, values) {
  const side = {}
  for (const field of kind.fields) {
    if (field.side && field.name in values) {
      side[field.name] = values[field.name]
      delete values[field.name]
    }
  }
  return side
}

/** "beach x5" | "monte-pirata + cerro-el-buey" | a rule object → the jsonb text. */
function parseRule(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray(raw.all_of)) return parseRule(raw.all_of.join(' + '))
    if (raw.tag) return parseRule(`${raw.tag} x${raw.count}`)
  }
  if (typeof raw !== 'string') throw new Error('rule must be text')
  const s = raw.trim().toLowerCase()
  const tagged = s.match(/^([a-z0-9-]+)\s*[x×]\s*(\d+)$/)
  if (tagged) {
    const count = Number(tagged[2])
    if (count < 1) throw new Error('rule count must be at least 1')
    return JSON.stringify({ tag: tagged[1], count })
  }
  const slugs = [...new Set(s.split(/[+,]/).map((x) => x.trim()).filter(Boolean))]
  if (!slugs.length || !slugs.every((x) => SLUG_RE.test(x)))
    throw new Error('rule: write “beach x5” (5 cards tagged beach) or “slug-one + slug-two” (these exact cards)')
  return JSON.stringify({ all_of: slugs })
}

// Bounding boxes (generous). Catch the classic swapped lat/lng paste, which
// would otherwise drop a pin in Antarctica and silently vanish from the map.
// Transport gets eastern Puerto Rico too: the Ceiba ferry terminal, Fajardo and
// the San Juan / Ceiba airports are legitimate transport points off-island.
const VIEQUES = { latMin: 17.9, latMax: 18.25, lngMin: -65.65, lngMax: -65.15, name: 'Vieques' }
const EAST_PR = { latMin: 17.9, latMax: 18.55, lngMin: -66.2, lngMax: -65.15, name: 'eastern Puerto Rico' }
/** Test cards only (0056) — placed wherever the owner is testing from. */
const ANYWHERE = { latMin: -90, latMax: 90, lngMin: -180, lngMax: 180, name: 'the world' }

const isScalar = (v) => typeof v === 'string' || typeof v === 'number'

/** Coerce one form value to what Postgres expects; throws a user-facing message. */
function coerce(field, raw, box = VIEQUES) {
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')
  if (blank) {
    // NOT NULL columns with a DB default (cards.radius_m, sort…): a blank box
    // means "use the default", not NULL — which would fail the constraint.
    if (field.default !== undefined) return field.default
    if (field.required) throw new Error(`${field.name} is required`)
    // text[] columns are NOT NULL DEFAULT '{}' in every listing table → [] not null.
    if (field.type === 'list' || field.type === 'photos') return []
    if (field.type === 'schedule') return {}
    // Nullable booleans (stays.pets_allowed): NULL means "not known", which is
    // not the same as false — never collapse it.
    if (field.type === 'bool') return field.nullable ? null : false
    return null
  }
  switch (field.type) {
    case 'int':
    case 'number':
    case 'lat':
    case 'lng': {
      if (!isScalar(raw)) throw new Error(`${field.name} must be a number`)
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error(`${field.name} must be a number`)
      if (field.type === 'int' && !Number.isInteger(n)) throw new Error(`${field.name} must be a whole number`)
      if (field.type === 'lat' && (n < box.latMin || n > box.latMax))
        throw new Error(`latitude ${n} is outside ${box.name} (expect ~18.1) — swapped with longitude?`)
      if (field.type === 'lng' && (n < box.lngMin || n > box.lngMax))
        throw new Error(`longitude ${n} is outside ${box.name} (expect ~-65.4) — swapped with latitude?`)
      return n
    }
    case 'bool':
      if (raw === true || raw === 'true') return true
      if (raw === false || raw === 'false') return false
      throw new Error(`${field.name} must be yes, no${field.nullable ? ' or unknown' : ''}`)
    case 'list': {
      if (!Array.isArray(raw) && typeof raw !== 'string') throw new Error(`${field.name} must be a list`)
      const arr = Array.isArray(raw) ? raw : raw.split('\n')
      if (!arr.every(isScalar)) throw new Error(`${field.name} must be a list of text`)
      return arr.map((s) => String(s).trim()).filter(Boolean)
    }
    case 'photos': {
      // Ordered photo URLs (first = hero). Uploads add to it; the page also
      // reorders/removes. Only http(s) URLs — these render as <img src>.
      if (!Array.isArray(raw) || !raw.every((s) => typeof s === 'string'))
        throw new Error(`${field.name} must be a list of URLs`)
      const urls = raw.map((s) => s.trim()).filter(Boolean)
      if (!urls.every((u) => /^https:\/\/\S+$/i.test(u))) throw new Error('Photo URLs must start with https://')
      return [...new Set(urls)]
    }
    case 'url': {
      const s = String(raw).trim()
      if (!/^https?:\/\/\S+$/i.test(s)) throw new Error(`${field.name} must start with http:// or https://`)
      return s
    }
    case 'email': {
      const s = String(raw).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(`${field.name} is not a valid email`)
      return s
    }
    case 'slug': {
      const s = String(raw).trim().toLowerCase()
      if (!SLUG_RE.test(s)) throw new Error(`${field.name} must be lowercase words joined by dashes, e.g. monte-pirata`)
      return s
    }
    case 'select': {
      const s = String(raw).trim()
      if (!field.options.includes(s)) throw new Error(`${field.name} must be one of: ${field.options.join(', ')}`)
      return s
    }
    case 'hours': {
      // "19-24", "19,24" or the stored "[19,24)" → int4range text.
      const m = String(raw).trim().match(/^\[?\s*(\d{1,2})\s*[-,–]\s*(\d{1,2})\s*[)\]]?$/)
      const [a, b] = m ? [Number(m[1]), Number(m[2])] : []
      if (!m || a < 0 || b > 24 || a >= b)
        throw new Error(`${field.name}: write start-end hours like 19-24 (end after start, max 24; can't wrap midnight)`)
      return `[${a},${b})`
    }
    case 'date': {
      // A bare date means midnight in Puerto Rico (UTC-4, no DST).
      const s = String(raw).trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00-04:00`
      if (!Number.isNaN(Date.parse(s))) return s
      throw new Error(`${field.name} must be a date (YYYY-MM-DD)`)
    }
    case 'rule':
      return parseRule(raw)
    case 'schedule': {
      if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${field.name} must be an object`)
      const json = JSON.stringify(raw)
      if (json.length > 20_000) throw new Error(`${field.name} is too large`)
      return json // pg sends it as text; Postgres casts to jsonb
    }
    default:
      if (!isScalar(raw)) throw new Error(`${field.name} must be text`)
      return String(raw).trim()
  }
}

/**
 * Which important fields a listing is missing, for the "gaps" badge and the
 * completeness bar. Returns an array of field names, e.g. ['phones', 'hours'].
 */
function missingFields(kindKey, row) {
  // TODO(human): decide what "complete" means per kind.
  return []
}

// --- Middleware ---------------------------------------------------------------
const adminIds = () =>
  (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)

function requireAdmin(req, res, next) {
  if (!adminIds().includes(req.user.id)) {
    console.warn(`[admin] refused ${req.user.email} (${req.user.id})`)
    return res.status(403).json({ error: 'Not an admin' })
  }
  next()
}

function resolveKind(req, res) {
  const kind = Object.hasOwn(KINDS, req.params.kind) ? KINDS[req.params.kind] : null
  if (!kind) res.status(404).json({ error: 'Unknown kind' })
  return kind
}

/** Pick + coerce only whitelisted fields present in the body. */
function buildValues(kind, body, { partial, stored = null }) {
  const out = {}
  // Test cards (0056) may sit anywhere. On a PATCH the flag may not be in the
  // body (only changed fields are sent), so fall back to the stored row; and
  // turning a test card into a real one re-checks its stored spot.
  const isCards = kind.table === 'collectible_cards'
  const testCard = isCards && ('test_only' in body
    ? body.test_only === true || body.test_only === 'true'
    : stored?.test_only === true)
  const box = testCard ? ANYWHERE : kind.geoBox === 'EAST_PR' ? EAST_PR : VIEQUES
  if (isCards && !testCard && stored) {
    if (!('latitude' in body)) coerce({ name: 'latitude', type: 'lat' }, stored.latitude, box)
    if (!('longitude' in body)) coerce({ name: 'longitude', type: 'lng' }, stored.longitude, box)
  }
  for (const field of kind.fields) {
    if (partial && !(field.name in body)) continue
    out[field.name] = coerce(field, body[field.name], box)
  }
  if (kind.categoryColumn && kind.categoryColumn in body) {
    const slug = body[kind.categoryColumn]
    if (slug != null && typeof slug !== 'string') throw new Error('category must be text')
    out[kind.categoryColumn] = slug || null
  }
  if (kind.tagColumn && 'category_ids' in body) {
    const tags = body.category_ids
    if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))
      throw new Error('tags must be a list of text')
    out[kind.tagColumn] = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  }
  if ('is_active' in body) out.is_active = body.is_active === true
  return out
}

/** For photoStore 'table' kinds, pull the photo order out of the column values. */
function takePhotoOrder(kind, values) {
  if (kind.photoStore !== 'table' || !('images' in values)) return undefined
  const urls = values.images
  delete values.images
  return urls
}

// --- photos-table helpers (beaches) ---------------------------------------------
// place_kind is the table name, place_ref the id as text — the convention the
// beaches route and cli/import-photo.mjs already use.

/**
 * First touch of a listing that only has legacy images[]: copy them into
 * photos so an upload doesn't make them vanish (the app shows photos rows
 * INSTEAD of images[] as soon as one exists).
 */
async function seedLegacyPhotos(client, kind, id) {
  await client.query(
    `INSERT INTO photos (place_kind, place_ref, url, credit, sort_order)
     SELECT $1, l.id::text, u.url, l.image_credit, u.ord - 1
       FROM ${kind.table} l, unnest(l.images) WITH ORDINALITY AS u(url, ord)
      WHERE l.id = $2
        AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.place_kind = $1 AND p.place_ref = l.id::text)`,
    [kind.table, id],
  )
}

/** Apply the page's order: listed URLs active in that order, the rest hidden. */
export async function syncPhotoOrder(client, kind, id, urls) {
  await seedLegacyPhotos(client, kind, id)
  await client.query(
    `UPDATE photos p SET sort_order = x.ord - 1, is_active = true
       FROM unnest($3::text[]) WITH ORDINALITY AS x(url, ord)
      WHERE p.place_kind = $1 AND p.place_ref = $2 AND p.url = x.url`,
    [kind.table, String(id), urls],
  )
  // Soft-remove: the storage object and row stay, so a removal is reversible in SQL.
  await client.query(
    `UPDATE photos SET is_active = false
      WHERE place_kind = $1 AND place_ref = $2 AND is_active AND NOT (url = ANY($3::text[]))`,
    [kind.table, String(id), urls],
  )
}

/**
 * Turn the Postgres errors the editor can trigger into a readable 400.
 * Anything else falls through to fail() as a 500 with a generic message.
 */
// Readable versions of the 0055 CHECKs the card editor can hit.
const CHECK_MESSAGES = {
  collectible_cards_reveal_covers_collect: 'Reveal radius must be at least the collect radius',
  collectible_cards_radius_m_check: 'Collect radius must be 15–500 m',
  collectible_cards_reveal_radius_m_check: 'Reveal radius must be 50–1000 m',
  collectible_cards_window: 'Ends at must be after starts at',
  collectible_cards_cap: 'Max claims can’t be lower than the copies already collected',
  collectible_cards_max_claims_check: 'Max claims must be at least 1 (or blank for unlimited)',
}

function userFacingDbError(e) {
  if (e.userFacing) return e.message
  if (e.code === '23505') return /slug/.test(e.constraint || '') ? 'That slug is already used' : 'A listing with that name already exists'
  if (e.code === '23503') return 'That category does not exist'
  if (e.code === '23502') return `${e.column || 'A required field'} cannot be empty`
  if (e.code === '23514') return CHECK_MESSAGES[e.constraint] || `A value breaks a rule on this table (${e.constraint || 'check constraint'})`
  return null
}

async function setCategories(client, kind, listingId, ids) {
  if (!kind.joinTable || !Array.isArray(ids)) return
  // Positive integers only: Number(null) / Number('') are 0, which is an
  // integer but never a real category id.
  const clean = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  await client.query(`DELETE FROM ${kind.joinTable} WHERE listing_id = $1`, [listingId])
  if (clean.length) {
    await client.query(
      `INSERT INTO ${kind.joinTable} (listing_id, category_id) SELECT $1, unnest($2::bigint[])`,
      [listingId, clean],
    )
  }
}

/** Load listings with their category ids, plus the computed gaps. */
export async function loadRows(pool, kindKey, kind, id = null) {
  // achievements has no updated_at (0055) — such kinds name the column to show.
  const selects = ['l.id', 'l.is_active', `l.${kind.timestampColumn || 'updated_at'} AS updated_at`]
  for (const x of kind.fields) {
    selects.push(
      x.side ? `s.${x.side} AS ${x.name}`
      : x.type === 'photos' && kind.photoStore === 'table'
        // Exactly what the app shows: active photos rows, else legacy images[].
        ? `COALESCE((SELECT array_agg(p.url ORDER BY p.sort_order, p.id) FROM photos p
                      WHERE p.place_kind = '${kind.table}' AND p.place_ref = l.id::text AND p.is_active),
                    l.images) AS images`
        : `l.${x.name}`,
    )
  }
  if (kind.categoryColumn) selects.push(`l.${kind.categoryColumn}`)
  const catExpr = kind.joinTable
    ? `COALESCE((SELECT array_agg(j.category_id ORDER BY j.category_id) FROM ${kind.joinTable} j WHERE j.listing_id = l.id), '{}')`
    : kind.tagColumn
      ? `l.${kind.tagColumn}`
      : `'{}'::bigint[]`
  const { rows } = await pool.query(
    `SELECT ${selects.join(', ')}, ${catExpr} AS category_ids
       FROM ${kind.table} l
      ${kind.sideJoin || ''}
      ${id ? 'WHERE l.id = $1' : ''}
      ORDER BY l.name`,
    id ? [id] : [],
  )
  return rows.map((r) => ({
    ...r,
    // Join-table ids are bigints (strings from pg) → numbers; tags stay strings.
    category_ids: kind.tagColumn ? r.category_ids : r.category_ids.map(Number),
    missing: missingFields(kindKey, r),
  }))
}

// --- Photos -------------------------------------------------------------------
// Upload = resize + strip → public `place-photos` bucket → append URL to the
// listing's `images` array (first = hero, which is what the app shows).
//
// WHY sharp: it auto-rotates from EXIF, caps size, and drops ALL metadata —
// iPhone photos carry the GPS position they were taken at, which must not be
// published. sharp is a devDependency and imported lazily here, so the Railway
// build (where these routes are never mounted) doesn't need it.
// iPhone HEIC (HEVC) isn't decodable by sharp's prebuilt libvips, so those go
// through macOS `sips` → JPEG first. This tool is local-only, on a Mac.
//
// WHY a per-upload storage policy: there is no service-role key in .env and the
// bucket has no standing INSERT policy (nothing on the web may write to it).
// So — like cli/import-photo.mjs — we open a policy for the duration of one
// upload, but tighter: only THIS admin's auth.uid() may insert, and the upload
// is sent with the admin's own JWT. Uniquely named so parallel uploads don't
// drop each other's policy.
const BUCKET = 'place-photos'
const MAX_PX = 2000
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function toWebJpeg(buf) {
  const { default: sharp } = await import('sharp')
  const encode = (input) =>
    sharp(input).rotate().resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true }) // no .withMetadata() → EXIF/GPS dropped
      .toBuffer({ resolveWithObject: true })
  try {
    return await encode(buf)
  } catch {
    // Probably HEIC. Let macOS decode it, then strip/resize with sharp as usual.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vq-photo-'))
    try {
      const src = path.join(dir, 'in.heic')
      const out = path.join(dir, 'out.jpg')
      await fs.writeFile(src, buf)
      await execFileP('sips', ['-s', 'format', 'jpeg', src, '--out', out])
      return await encode(await fs.readFile(out))
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
}

async function uploadToBucket(pool, { userId, token, key, body }) {
  if (!UUID_RE.test(userId)) throw new Error('bad user id') // interpolated into the policy below
  const policy = `admin_photo_upload_${randomUUID().replace(/-/g, '')}`
  await pool.query(
    `CREATE POLICY ${policy} ON storage.objects FOR INSERT TO authenticated
       WITH CHECK (bucket_id = '${BUCKET}' AND auth.uid() = '${userId}'::uuid)`,
  )
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'max-age=31536000',
      },
      body,
    })
    if (!res.ok) throw new Error(`storage upload failed (${res.status}): ${await res.text()}`)
  } finally {
    await pool.query(`DROP POLICY IF EXISTS ${policy} ON storage.objects`)
  }
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
}

// --- Schema guard ---------------------------------------------------------------
// Drop configured fields whose column doesn't exist yet (e.g. restaurant images
// before migration 0053), so a pending migration hides a field instead of
// breaking the whole tab.
export async function pruneMissingColumns(pool) {
  const { rows } = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [Object.values(KINDS).map((k) => k.table)],
  )
  const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`))
  for (const [key, kind] of Object.entries(KINDS)) {
    // Side fields (riddle_*) live in another table — not this one's columns.
    const present = (x) => x.side || have.has(`${kind.table}.${x.name}`)
    const missing = kind.fields.filter((x) => !present(x))
    if (missing.length) {
      console.warn(`[admin] ${key}: column(s) not in DB yet, hidden: ${missing.map((x) => x.name).join(', ')}`)
      kind.fields = kind.fields.filter(present)
    }
  }
}

// --- Local-only lock ----------------------------------------------------------
// The admin tool runs ONLY on the owner's machine. Three independent layers:
//   1. mountAdmin() registers nothing when NODE_ENV=production (Railway), so
//      /api/admin/* is a plain 404 on the public API.
//   2. requireLocal refuses any request whose TCP peer isn't this machine.
//      It reads req.socket.remoteAddress, NOT req.ip: server.js sets
//      `trust proxy`, so req.ip comes from X-Forwarded-For, which anyone can forge.
//   3. requireAuth + ADMIN_USER_IDS, as before.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function requireLocal(req, res, next) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) {
    console.warn(`[admin] refused non-local request from ${req.socket.remoteAddress}`)
    return res.status(404).json({ error: 'Not found' })
  }
  next()
}

// --- Routes -------------------------------------------------------------------
export function mountAdmin(app, pool) {
  if (process.env.NODE_ENV === 'production') {
    console.log('[admin] production — admin routes not mounted (local-only tool)')
    return
  }
  // Check the schema once; every admin request waits for it (milliseconds, once).
  const ready = pruneMissingColumns(pool).catch((e) => console.error('[admin] schema check failed', e))
  const awaitReady = async (_req, _res, next) => { await ready; next() }
  const gate = [requireLocal, awaitReady, requireAuth, requireAdmin]

  // Upload one photo to a listing: raw image body (not JSON/base64 — phone
  // photos are several MB). Resized + stripped, stored, appended to `images`.
  app.post(
    '/api/admin/:kind/:id/photo',
    ...gate,
    rateLimit({ windowMs: 60_000, max: 30 }),
    express.raw({ type: UPLOAD_TYPES, limit: '30mb' }),
    async (req, res) => {
      const kind = resolveKind(req, res)
      if (!kind) return
      if (!kind.fields.some((x) => x.name === 'images' && x.type === 'photos'))
        return res.status(400).json({ error: `${kind.label} don't have photos (yet)` })
      const id = Number(req.params.id)
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' })
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: 'Send a JPEG, PNG, WebP or HEIC image' })
      try {
        const { rows } = await pool.query(`SELECT name FROM ${kind.table} WHERE id = $1`, [id])
        if (!rows.length) return res.status(404).json({ error: 'Not found' })

        let image
        try {
          image = await toWebJpeg(req.body)
        } catch {
          return res.status(400).json({ error: 'Could not read that image' })
        }
        const slug = rows[0].name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'listing'
        const key = `${kind.table}/${id}-${slug}-${Date.now().toString(36)}.jpg`
        const url = await uploadToBucket(pool, {
          userId: req.user.id,
          token: req.headers.authorization.slice(7),
          key,
          body: image.data,
        })
        if (kind.photoStore === 'table') {
          // Beaches: a photos row at the end of the order (legacy images seeded first).
          const client = await pool.connect()
          try {
            await client.query('BEGIN')
            await seedLegacyPhotos(client, kind, id)
            await client.query(
              `INSERT INTO photos (place_kind, place_ref, url, storage_path, sort_order, width_px, height_px)
               SELECT $1, $2, $3, $4,
                      COALESCE((SELECT max(sort_order) + 1 FROM photos WHERE place_kind = $1 AND place_ref = $2 AND is_active), 0),
                      $5, $6`,
              [kind.table, String(id), url, key, image.info.width, image.info.height],
            )
            await client.query('COMMIT')
          } catch (e) {
            await client.query('ROLLBACK').catch(() => {})
            throw e
          } finally {
            client.release()
          }
        } else {
          // Append atomically on the server so two quick uploads can't clobber each other.
          await pool.query(`UPDATE ${kind.table} SET images = array_append(images, $2) WHERE id = $1`, [id, url])
        }
        console.log(`[admin] ${req.user.email} photo → ${req.params.kind}#${id} ${image.info.width}×${image.info.height} ${(image.data.length / 1024).toFixed(0)}KB`)
        res.status(201).json((await loadRows(pool, req.params.kind, kind, id))[0])
      } catch (e) {
        fail(res, `POST /api/admin/${req.params.kind}/${id}/photo`, e)
      }
    },
  )

  // Config + categories for every kind, so the page builds its forms from one call.
  app.get('/api/admin/config', ...gate, async (_req, res) => {
    try {
      const out = {}
      for (const [key, kind] of Object.entries(KINDS)) {
        let categories = []
        if (kind.noCategories) {
          // e.g. achievements — no category table, no chips.
        } else if (kind.tagColumn) {
          // The app's chips first, then any other tag already used in the data
          // (e.g. 'surfing'), so nothing existing is invisible in the editor.
          const { rows } = await pool.query(
            `SELECT DISTINCT unnest(${kind.tagColumn}) AS tag FROM ${kind.table} ORDER BY 1`,
          )
          const known = new Set(kind.tagOptions.map((t) => t.slug))
          categories = [
            ...kind.tagOptions,
            ...rows.filter((r) => !known.has(r.tag)).map((r) => ({ slug: r.tag, label: r.tag })),
          ].map((t) => ({ id: t.slug, slug: t.slug, label: t.label }))
        } else {
          const { rows } = await pool.query(
            `SELECT id, slug, label FROM ${kind.catTable} ORDER BY sort_order, label`,
          )
          categories = rows.map((r) => ({ ...r, id: Number(r.id) }))
        }
        out[key] = {
          label: kind.label,
          fields: kind.fields,
          // 'many' = chips (join table or tags); 'one' = a single select (stays);
          // 'none' = the kind has no categories (achievements).
          categoryMode: kind.noCategories ? 'none' : kind.categoryColumn ? 'one' : 'many',
          categoryLabel: kind.categoryLabel || 'Category',
          categories,
        }
      }
      res.json(out)
    } catch (e) {
      fail(res, 'GET /api/admin/config', e)
    }
  })

  app.get('/api/admin/:kind', ...gate, async (req, res) => {
    const kind = resolveKind(req, res)
    if (!kind) return
    try {
      res.json(await loadRows(pool, req.params.kind, kind))
    } catch (e) {
      fail(res, `GET /api/admin/${req.params.kind}`, e)
    }
  })

  app.post('/api/admin/:kind', ...gate, rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
    const kind = resolveKind(req, res)
    if (!kind) return
    let values, side
    try {
      values = buildValues(kind, req.body || {}, { partial: false })
      takePhotoOrder(kind, values) // a brand-new listing has no photos rows to order
      side = takeSide(kind, values)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const names = Object.keys(values)
      const { rows } = await client.query(
        `INSERT INTO ${kind.table} (${names.join(', ')})
         VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        names.map((n) => values[n]),
      )
      const id = rows[0].id
      await setCategories(client, kind, id, (req.body || {}).category_ids)
      if (kind.saveSide && Object.keys(side).length) await kind.saveSide(client, id, side)
      await client.query('COMMIT')
      console.log(`[admin] ${req.user.email} created ${req.params.kind}#${id}`)
      res.status(201).json((await loadRows(pool, req.params.kind, kind, id))[0])
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      const msg = userFacingDbError(e)
      if (msg) return res.status(400).json({ error: msg })
      fail(res, `POST /api/admin/${req.params.kind}`, e)
    } finally {
      client.release()
    }
  })

  app.patch('/api/admin/:kind/:id', ...gate, rateLimit({ windowMs: 60_000, max: 120 }), async (req, res) => {
    const kind = resolveKind(req, res)
    if (!kind) return
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad id' })
    let values, photoOrder, side
    try {
      const stored = kind.table === 'collectible_cards'
        ? (await pool.query(
            'SELECT test_only, latitude, longitude FROM collectible_cards WHERE id = $1', [id],
          )).rows[0] ?? null
        : null
      values = buildValues(kind, req.body || {}, { partial: true, stored })
      photoOrder = takePhotoOrder(kind, values) // beaches: synced to photos rows, not a column
      side = takeSide(kind, values) // cards: riddle_* → card_challenges
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const names = Object.keys(values)
      // Always confirm the row exists (a categories-only PATCH has no UPDATE to
      // report rowCount, and would otherwise surface as an FK error).
      const { rowCount } = names.length
        ? await client.query(
            `UPDATE ${kind.table} SET ${names.map((n, i) => `${n} = $${i + 2}`).join(', ')} WHERE id = $1`,
            [id, ...names.map((n) => values[n])],
          )
        : await client.query(`SELECT 1 FROM ${kind.table} WHERE id = $1`, [id])
      if (!rowCount) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Not found' })
      }
      await setCategories(client, kind, id, (req.body || {}).category_ids)
      if (photoOrder) await syncPhotoOrder(client, kind, id, photoOrder)
      if (kind.saveSide && Object.keys(side).length) await kind.saveSide(client, id, side)
      await client.query('COMMIT')
      console.log(`[admin] ${req.user.email} updated ${req.params.kind}#${id} [${[...names, ...(photoOrder ? ['photos'] : []), ...Object.keys(side)].join(',')}]`)
      res.json((await loadRows(pool, req.params.kind, kind, id))[0])
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      const msg = userFacingDbError(e)
      if (msg) return res.status(400).json({ error: msg })
      fail(res, `PATCH /api/admin/${req.params.kind}/${id}`, e)
    } finally {
      client.release()
    }
  })
}
