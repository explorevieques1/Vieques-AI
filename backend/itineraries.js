/**
 * Trip planner routes — the Exploration tier's itinerary builder.
 *
 * Gated on 'itinerary' throughout. Unlike favorites (retention, ungated),
 * this is the feature the top tier is sold on.
 *
 * Ownership is proven by `user_id = $userId` in the WHERE clause of every
 * statement rather than by a fetch-then-check. RLS also covers this, but
 * these routes connect as the table owner and bypass it — the predicate in
 * the SQL is the actual enforcement.
 */
import { parsePlaceId, shapeSnapshot } from './server.js'
import { requireAuth, requireTier } from './middleware.js'
import { fail } from './httpError.js'

const MAX_TRIP_DAYS = 14
const MAX_TITLE = 80

/** Camel-case the wire shape. The client never sees snake_case columns. */
function toTrip(row) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date
      ? new Date(row.start_date).toISOString().slice(0, 10) : null,
    endDate: row.end_date
      ? new Date(row.end_date).toISOString().slice(0, 10) : null,
    itemCount: Number(row.item_count ?? 0),
    updatedAt: row.updated_at,
  }
}

function toItem(row) {
  return {
    placeId: row.place_id,
    placeKind: row.place_kind,
    placeRef: row.place_ref,
    dayIndex: row.day_index,
    sortOrder: row.sort_order,
    snapshot: row.snapshot ?? {},
  }
}

/** ISO yyyy-mm-dd or null. Rejects anything else, including Date objects. */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : v
}

/**
 * Validate a title + date pair, mirroring the CHECKs in 0045.
 * Returns an error string, or null when the input is good.
 *
 * Duplicating the constraints here is deliberate: the database is the
 * backstop, but a 23514 check_violation surfaces to the user as a generic
 * 500. These produce a sentence the UI can render.
 */
function validateTrip({ title, startDate, endDate }) {
  if (typeof title !== 'string' || !title.trim()) return 'Name your trip.'
  if (title.trim().length > MAX_TITLE) return `Keep the name under ${MAX_TITLE} characters.`
  if (startDate === undefined || endDate === undefined) return 'Use dates like 2026-03-07.'
  if ((startDate === null) !== (endDate === null)) return 'Pick both a start and an end date.'
  if (startDate && endDate) {
    const days = Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000,
    ) + 1
    if (days < 1) return 'The end date comes before the start date.'
    if (days > MAX_TRIP_DAYS) return `Trips can span at most ${MAX_TRIP_DAYS} days.`
  }
  return null
}

export function mountItineraries(app, pool) {
  const gate = [requireAuth, requireTier(pool, 'itinerary')]

  /** One trip with its items, or null when it is not this user's. */
  async function loadDetail(id, userId) {
    const { rows } = await pool.query(
      `SELECT i.*, (SELECT count(*) FROM public.itinerary_items t
                     WHERE t.itinerary_id = i.id) AS item_count
         FROM public.itineraries i
        WHERE i.id = $1 AND i.user_id = $2`,
      [id, userId],
    )
    if (!rows[0]) return null
    const items = await pool.query(
      `SELECT place_id, place_kind, place_ref, day_index, sort_order, snapshot
         FROM public.itinerary_items
        WHERE itinerary_id = $1
        ORDER BY day_index NULLS LAST, sort_order, created_at`,
      [id],
    )
    return { ...toTrip(rows[0]), items: items.rows.map(toItem) }
  }

  // ---- LIST -----------------------------------------------------------
  // No items: the list only renders a count, and shipping every snapshot
  // for every trip would be the largest response in the app for the
  // least-read data.
  app.get('/api/itineraries', ...gate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT i.*, (SELECT count(*) FROM public.itinerary_items t
                       WHERE t.itinerary_id = i.id) AS item_count
           FROM public.itineraries i
          WHERE i.user_id = $1
          ORDER BY i.updated_at DESC`,
        [req.user.id],
      )
      res.json(rows.map(toTrip))
    } catch (e) {
      fail(res, 'itineraries:list', e)
    }
  })

  // ---- CREATE ---------------------------------------------------------
  app.post('/api/itineraries', ...gate, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const startDate = parseDate(req.body?.startDate)
    const endDate = parseDate(req.body?.endDate)
    const bad = validateTrip({ title, startDate, endDate })
    if (bad) return res.status(400).json({ error: bad })
    try {
      const { rows } = await pool.query(
        `INSERT INTO public.itineraries (user_id, title, start_date, end_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.id, title, startDate, endDate],
      )
      res.status(201).json(toTrip(rows[0]))
    } catch (e) {
      fail(res, 'itineraries:create', e)
    }
  })

  // ---- RENAME / RE-DATE ----------------------------------------------
  app.patch('/api/itineraries/:id', ...gate, async (req, res) => {
    const cur = await pool.query(
      `SELECT * FROM public.itineraries WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id],
    ).catch(() => ({ rows: [] }))
    if (!cur.rows[0]) return res.status(404).json({ error: 'Trip not found.' })

    const prev = toTrip(cur.rows[0])
    const title = req.body?.title === undefined
      ? prev.title : String(req.body.title).trim()
    const startDate = req.body?.startDate === undefined
      ? prev.startDate : parseDate(req.body.startDate)
    const endDate = req.body?.endDate === undefined
      ? prev.endDate : parseDate(req.body.endDate)

    const bad = validateTrip({ title, startDate, endDate })
    if (bad) return res.status(400).json({ error: bad })
    try {
      const { rows } = await pool.query(
        `UPDATE public.itineraries
            SET title = $3, start_date = $4, end_date = $5, updated_at = now()
          WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, req.user.id, title, startDate, endDate],
      )
      // The pre-check above and this UPDATE are two round trips, so the row
      // can vanish between them (a concurrent DELETE, or the same user
      // double-tapping delete then rename). Without this guard rows[0] is
      // undefined and toTrip() throws reading row.start_date — caught below,
      // but reported as a generic 500 instead of the 404 this actually is.
      if (!rows[0]) return res.status(404).json({ error: 'Trip not found.' })
      res.json(toTrip(rows[0]))
    } catch (e) {
      fail(res, 'itineraries:update', e)
    }
  })

  // ---- DELETE ---------------------------------------------------------
  app.delete('/api/itineraries/:id', ...gate, async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM public.itineraries WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!rowCount) return res.status(404).json({ error: 'Trip not found.' })
      res.status(204).end()
    } catch (e) {
      fail(res, 'itineraries:delete', e)
    }
  })

  // ---- DETAIL ---------------------------------------------------------
  app.get('/api/itineraries/:id', ...gate, async (req, res) => {
    try {
      const detail = await loadDetail(req.params.id, req.user.id)
      if (!detail) return res.status(404).json({ error: 'Trip not found.' })
      res.json(detail)
    } catch (e) {
      fail(res, 'itineraries:detail', e)
    }
  })

  // ---- ADD / MOVE / REMOVE AN ITEM ------------------------------------
  //  One route, three actions, because all three are "the membership of
  //  this trip changed" and all three return the same refreshed detail —
  //  which is what the client needs anyway to redraw the pins.
  //
  //  Body: { action: 'add'|'move'|'remove', placeId, dayIndex?, snapshot? }
  app.put('/api/itineraries/:id/items', ...gate, async (req, res) => {
    const action = req.body?.action
    const parsed = parsePlaceId(req.body?.placeId)
    if (!parsed) return res.status(400).json({ error: 'Invalid place id.' })

    const rawDay = req.body?.dayIndex
    const dayIndex = rawDay === null || rawDay === undefined
      ? null
      : Number.isInteger(rawDay) && rawDay >= 0 && rawDay <= MAX_TRIP_DAYS - 1
        ? rawDay
        : undefined
    if (dayIndex === undefined) {
      return res.status(400).json({ error: 'That day is not part of this trip.' })
    }

    try {
      // Ownership first — every branch below depends on it.
      const own = await pool.query(
        `SELECT id FROM public.itineraries WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!own.rows[0]) return res.status(404).json({ error: 'Trip not found.' })

      if (action === 'remove') {
        await pool.query(
          `DELETE FROM public.itinerary_items
            WHERE itinerary_id = $1 AND place_id = $2`,
          [req.params.id, parsed.id],
        )
      } else if (action === 'move') {
        await pool.query(
          `UPDATE public.itinerary_items SET day_index = $3
            WHERE itinerary_id = $1 AND place_id = $2`,
          [req.params.id, parsed.id, dayIndex],
        )
      } else if (action === 'add') {
        // sort_order = current tail of that day, so a new item lands last.
        await pool.query(
          `INSERT INTO public.itinerary_items
             (itinerary_id, place_id, place_kind, place_ref, day_index,
              sort_order, snapshot)
           VALUES ($1, $2, $3, $4, $5,
             COALESCE((SELECT max(sort_order) + 1 FROM public.itinerary_items
                        WHERE itinerary_id = $1
                          AND day_index IS NOT DISTINCT FROM $5), 0),
             $6)
           ON CONFLICT (itinerary_id, place_id)
             DO UPDATE SET day_index = EXCLUDED.day_index,
                           snapshot  = EXCLUDED.snapshot`,
          [req.params.id, parsed.id, parsed.kind, parsed.ref, dayIndex,
           JSON.stringify(shapeSnapshot(req.body?.snapshot))],
        )
      } else {
        return res.status(400).json({ error: 'Unknown action.' })
      }

      await pool.query(
        `UPDATE public.itineraries SET updated_at = now() WHERE id = $1`,
        [req.params.id],
      )
      res.json(await loadDetail(req.params.id, req.user.id))
    } catch (e) {
      fail(res, 'itineraries:items', e)
    }
  })
}
