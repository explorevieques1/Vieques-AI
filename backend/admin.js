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
import { requireAuth, rateLimit } from './middleware.js'
import { fail } from './httpError.js'

// --- Field sets ---------------------------------------------------------------
// type drives both server-side coercion and the form widget the page renders:
//   text | longtext | int | number | bool | list (Postgres text[]) | lat | lng
//   | url | email | select (options from `options`) | schedule (jsonb object)
const f = (name, type = 'text', extra = {}) => ({ name, type, ...extra })

const CONTACT = [
  f('phones', 'list'), f('email', 'email'), f('website', 'url'),
  f('address'), f('location_area'), f('latitude', 'lat'), f('longitude', 'lng'),
  f('hours', 'longtext'),
]

const LISTING_BASE = [f('name', 'text', { required: true }), f('description', 'longtext'), ...CONTACT]

/**
 * Every editable kind. `joinTable` = many-to-many categories; `categoryColumn`
 * = a single slug column on the listing itself (stays only).
 */
export const KINDS = {
  transport: {
    label: 'Transport', table: 'transport_listings',
    catTable: 'transport_categories', joinTable: 'transport_listing_categories',
    fields: [...LISTING_BASE, f('metadata', 'schedule')],
    geoBox: 'EAST_PR', // ferry terminal / airports are off-island
  },
  restaurants: {
    label: 'Restaurants', table: 'restaurant_listings',
    catTable: 'restaurant_categories', joinTable: 'restaurant_listing_categories',
    fields: [...LISTING_BASE, f('cuisine'), f('price'), f('tripadvisor_location_id')],
  },
  activities: {
    label: 'Activities', table: 'activity_listings',
    catTable: 'activity_categories', joinTable: 'activity_listing_categories',
    fields: [...LISTING_BASE, f('price_info'), f('images', 'list'), f('image_credit')],
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
      f('booking_url', 'url'), f('images', 'list'), f('image_credit'),
      ...CONTACT, f('directions_note', 'longtext'), f('tripadvisor_location_id'),
    ],
  },
}

// Bounding boxes (generous). Catch the classic swapped lat/lng paste, which
// would otherwise drop a pin in Antarctica and silently vanish from the map.
// Transport gets eastern Puerto Rico too: the Ceiba ferry terminal, Fajardo and
// the San Juan / Ceiba airports are legitimate transport points off-island.
const VIEQUES = { latMin: 17.9, latMax: 18.25, lngMin: -65.65, lngMax: -65.15, name: 'Vieques' }
const EAST_PR = { latMin: 17.9, latMax: 18.55, lngMin: -66.2, lngMax: -65.15, name: 'eastern Puerto Rico' }

const isScalar = (v) => typeof v === 'string' || typeof v === 'number'

/** Coerce one form value to what Postgres expects; throws a user-facing message. */
function coerce(field, raw, box = VIEQUES) {
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')
  if (blank) {
    if (field.required) throw new Error(`${field.name} is required`)
    // text[] columns are NOT NULL DEFAULT '{}' in every listing table → [] not null.
    if (field.type === 'list') return []
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
function buildValues(kind, body, { partial }) {
  const out = {}
  const box = kind.geoBox === 'EAST_PR' ? EAST_PR : VIEQUES
  for (const field of kind.fields) {
    if (partial && !(field.name in body)) continue
    out[field.name] = coerce(field, body[field.name], box)
  }
  if (kind.categoryColumn && kind.categoryColumn in body) {
    const slug = body[kind.categoryColumn]
    if (slug != null && typeof slug !== 'string') throw new Error('category must be text')
    out[kind.categoryColumn] = slug || null
  }
  if ('is_active' in body) out.is_active = body.is_active === true
  return out
}

/**
 * Turn the Postgres errors the editor can trigger into a readable 400.
 * Anything else falls through to fail() as a 500 with a generic message.
 */
function userFacingDbError(e) {
  if (e.code === '23505') return 'A listing with that name already exists'
  if (e.code === '23503') return 'That category does not exist'
  if (e.code === '23502') return `${e.column || 'A required field'} cannot be empty`
  if (e.code === '23514') return `A value breaks a rule on this table (${e.constraint || 'check constraint'})`
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
  const cols = ['id', 'is_active', 'updated_at', ...kind.fields.map((x) => x.name)]
  if (kind.categoryColumn) cols.push(kind.categoryColumn)
  const catExpr = kind.joinTable
    ? `COALESCE((SELECT array_agg(j.category_id ORDER BY j.category_id) FROM ${kind.joinTable} j WHERE j.listing_id = l.id), '{}')`
    : `'{}'::bigint[]`
  const { rows } = await pool.query(
    `SELECT ${cols.map((c) => `l.${c}`).join(', ')}, ${catExpr} AS category_ids
       FROM ${kind.table} l
      ${id ? 'WHERE l.id = $1' : ''}
      ORDER BY l.name`,
    id ? [id] : [],
  )
  return rows.map((r) => ({
    ...r,
    category_ids: r.category_ids.map(Number),
    missing: missingFields(kindKey, r),
  }))
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
  const gate = [requireLocal, requireAuth, requireAdmin]

  // Config + categories for every kind, so the page builds its forms from one call.
  app.get('/api/admin/config', ...gate, async (_req, res) => {
    try {
      const out = {}
      for (const [key, kind] of Object.entries(KINDS)) {
        const { rows } = await pool.query(
          `SELECT id, slug, label FROM ${kind.catTable} ORDER BY sort_order, label`,
        )
        out[key] = {
          label: kind.label,
          fields: kind.fields,
          categoryMode: kind.joinTable ? 'many' : 'one',
          categories: rows.map((r) => ({ ...r, id: Number(r.id) })),
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
    let values
    try {
      values = buildValues(kind, req.body || {}, { partial: false })
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
    let values
    try {
      values = buildValues(kind, req.body || {}, { partial: true })
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
      await client.query('COMMIT')
      console.log(`[admin] ${req.user.email} updated ${req.params.kind}#${id} [${names.join(',')}]`)
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
