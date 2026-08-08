# Trip Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Exploration-tier trip planner — named, date-ranged trips whose places are bucketed into days, living inside Saved on both mobile (bottom sheet) and desktop (left panel), with a trip's pins auto-loading on the map when opened.

**Architecture:** Two Postgres tables modeled directly on `favorites` (namespaced `place_id` + `snapshot jsonb`, so rendering a trip is one query, not a ten-way fan-out). Six Express routes gated on `requireTier(pool, 'itinerary')`. On the client, one optimistic hook (`useItineraries`) and four components that render identically on both platforms — because `SavedBody` is already shared by the mobile sheet and the desktop left panel, the planner inherits that for free.

**Tech Stack:** Postgres 15 + PostGIS (Supabase) · Node/Express ESM · React 19 + TypeScript + Vite · Tailwind v4 · Radix + vaul · MapLibre GL

## Global Constraints

- **No test runner exists in this repo.** Verification is SQL assertions run via `psql`/Supabase MCP, `curl` against a local backend, `npx tsc -b`, and explicit manual UI checks. Do not scaffold vitest/jest — adding a test framework is out of scope for this plan.
- **Migration number is `0045`.** `0044_ai_credit_purchases.sql` exists and is currently untracked in git.
- **`place_id` format is `${kind}:${rawId}`**, regex `^[a-z]+:[A-Za-z0-9._-]+$`. Always derive `place_kind`/`place_ref` server-side; never read them from a request body.
- **Ten place kinds:** `beach, restaurant, stay, activity, service, transport, essential, snorkel, kayak, trail`. Note the existing `PLACE_KINDS` set in `backend/server.js` omits `kayak` — Task 3 fixes that.
- **Trip length cap: 14 days** (`day_index` 0–13). **Trips per user: unlimited.**
- **Title: 1–80 characters after trimming.**
- **Dates are both-or-neither.** A trip has both `start_date` and `end_date`, or neither.
- **Tier gate:** every itinerary route uses `requireAuth` + `requireTier(pool, 'itinerary')` (Exploration only).
- **Commit after every task.** Do not push until the whole plan is done and the user has reviewed.
- **Do not restructure `MapView.tsx`** (1441 lines). It gains a pin source and wiring only.

---

## File Structure

### Create

| File | Responsibility |
|---|---|
| `db/migrations/0045_itineraries.sql` | Two tables, CHECKs, indexes, RLS |
| `backend/itineraries.js` | Six route handlers, exported as a mount function |
| `frontend/src/hooks/useItineraries.ts` | Optimistic client state; mirrors `useFavorites` |
| `frontend/src/components/TripsBody.tsx` | View 1 — trip list + segment host |
| `frontend/src/components/TripDetailBody.tsx` | View 2 — day sections + place rows |
| `frontend/src/components/TripForm.tsx` | Create/edit: name field, date range, validation |
| `frontend/src/components/AddToTripSheet.tsx` | Trip + day picker dialog |

### Modify

| File | Change |
|---|---|
| `backend/server.js` | Export `parsePlaceId`/`shapeSnapshot`, add `kayak`, mount router |
| `frontend/src/lib/api.ts` | Six fetch wrappers + types |
| `frontend/src/components/SavedBody.tsx` | `Places | Trips` segment control |
| `frontend/src/components/PlaceCard.tsx` | "Add to trip" action |
| `frontend/src/components/PlaceDetailPanel.tsx` | "Add to trip" action |
| `frontend/src/components/MapTopBar.tsx` | Wire Build Itinerary to the real view |
| `frontend/src/components/MapView.tsx` | Active-trip pins, remove the stub toast |

---

## Task 1: Database schema

**Files:**
- Create: `db/migrations/0045_itineraries.sql`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: tables `public.itineraries`, `public.itinerary_items` with the exact column names every later task queries.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 0045_itineraries.sql
-- Trip planner — the Exploration tier's itinerary builder.
--
-- MODELED ON 0032_favorites.sql. Same namespaced place_id, same
-- snapshot jsonb, same per-user RLS. Read that file's header first;
-- the reasoning for those three decisions is identical here and is
-- not repeated.
--
-- WHY snapshot jsonb (short version)
-- ----------------------------------
-- A trip's places span up to ten listing tables. Opening a trip must
-- drop every pin on the map at once, so resolving live would be a
-- ten-way fan-out for a list of six items. The snapshot is the card.
-- It may go stale; tapping a row loads the live record anyway.
--
-- WHY day_index is nullable and unbounded by the trip's dates
-- -----------------------------------------------------------
-- The CHECK below (0..13) is the ABSOLUTE 14-day product cap, NOT the
-- individual trip's current length. Nothing ties an item's day to its
-- trip's date range on purpose: shortening a trip must never delete a
-- user's work. An item left on day 4 of a now-3-day trip keeps
-- day_index = 3 and renders under "Unscheduled"; lengthen the trip and
-- it reappears on day 4 where the user put it. That fallback lives in
-- the UI, not here.
--
-- NULL day_index means "Unscheduled" — also the only bucket a dateless
-- trip has.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.itineraries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Both or neither: a start with no end has no day count, and an end
  -- with no start cannot be ordered.
  CONSTRAINT itin_dates_paired
    CHECK ((start_date IS NULL) = (end_date IS NULL)),
  CONSTRAINT itin_dates_ordered
    CHECK (start_date IS NULL OR end_date >= start_date),
  -- 14 days inclusive. 30 day-sections in a 431px map band is unusable.
  CONSTRAINT itin_dates_capped
    CHECK (start_date IS NULL OR end_date - start_date <= 13)
);

CREATE TABLE IF NOT EXISTS public.itinerary_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  place_id      text NOT NULL CHECK (place_id ~ '^[a-z]+:[A-Za-z0-9._-]+$'),
  place_kind    text NOT NULL CHECK (place_kind IN (
                  'beach', 'restaurant', 'stay', 'activity', 'service',
                  'transport', 'essential', 'snorkel', 'kayak', 'trail')),
  place_ref     text NOT NULL,
  day_index     int CHECK (day_index BETWEEN 0 AND 13),
  sort_order    int NOT NULL DEFAULT 0,
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A place appears at most once per trip, so a double-tap cannot
  -- duplicate it and moving days is an UPDATE rather than delete+insert.
  UNIQUE (itinerary_id, place_id)
);

-- The only trip-list read: this user's trips, most recently touched first.
CREATE INDEX IF NOT EXISTS idx_itineraries_user
  ON public.itineraries (user_id, updated_at DESC);

-- The only trip-detail read: one trip's items in render order.
CREATE INDEX IF NOT EXISTS idx_itinerary_items_trip
  ON public.itinerary_items (itinerary_id, day_index NULLS LAST, sort_order);

-- ------------------------------------------------------------
-- RLS. The user owns these rows outright.
--
-- UPDATE *is* granted here, unlike favorites (0032) where a row is only
-- ever created or removed. Renaming a trip, changing its dates, and
-- moving an item between days are all edits.
--
-- itinerary_items has no user_id of its own; ownership is proven by a
-- join to the parent trip. Every policy therefore carries the EXISTS
-- subquery — including USING *and* WITH CHECK on UPDATE, so an item
-- cannot be re-parented into someone else's trip.
-- ------------------------------------------------------------
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own itineraries read" ON public.itineraries;
CREATE POLICY "own itineraries read" ON public.itineraries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries insert" ON public.itineraries;
CREATE POLICY "own itineraries insert" ON public.itineraries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries update" ON public.itineraries;
CREATE POLICY "own itineraries update" ON public.itineraries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries delete" ON public.itineraries;
CREATE POLICY "own itineraries delete" ON public.itineraries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own items read" ON public.itinerary_items;
CREATE POLICY "own items read" ON public.itinerary_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items insert" ON public.itinerary_items;
CREATE POLICY "own items insert" ON public.itinerary_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items update" ON public.itinerary_items;
CREATE POLICY "own items update" ON public.itinerary_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items delete" ON public.itinerary_items;
CREATE POLICY "own items delete" ON public.itinerary_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Apply to the Supabase project (`dbotrrrbqwgzccuiylef`) via the Supabase MCP
`apply_migration` tool, name `0045_itineraries`, or by running the file against
the database directly.

- [ ] **Step 3: Verify the constraints reject bad rows**

Run each of these. The first must succeed; every other must FAIL.

```sql
-- Setup: grab any real user id.
CREATE TEMP TABLE _u AS SELECT id FROM auth.users LIMIT 1;

-- 1. MUST SUCCEED — valid 5-day trip
INSERT INTO public.itineraries (user_id, title, start_date, end_date)
SELECT id, 'Beach Days', '2026-03-03', '2026-03-07' FROM _u;

-- 2. MUST FAIL — itin_dates_capped (15 days)
INSERT INTO public.itineraries (user_id, title, start_date, end_date)
SELECT id, 'Too Long', '2026-03-01', '2026-03-15' FROM _u;

-- 3. MUST FAIL — itin_dates_paired (start without end)
INSERT INTO public.itineraries (user_id, title, start_date)
SELECT id, 'Half Dated', '2026-03-01' FROM _u;

-- 4. MUST FAIL — itin_dates_ordered (end before start)
INSERT INTO public.itineraries (user_id, title, start_date, end_date)
SELECT id, 'Backwards', '2026-03-07', '2026-03-03' FROM _u;

-- 5. MUST FAIL — title check (blank after trim)
INSERT INTO public.itineraries (user_id, title) SELECT id, '   ' FROM _u;

-- 6. MUST SUCCEED — dateless trip is valid
INSERT INTO public.itineraries (user_id, title) SELECT id, 'Someday' FROM _u;
```

- [ ] **Step 4: Verify items, uniqueness, and cascade**

```sql
-- MUST SUCCEED
INSERT INTO public.itinerary_items
  (itinerary_id, place_id, place_kind, place_ref, day_index, snapshot)
SELECT id, 'beach:3', 'beach', '3', 0, '{"name":"Caracas Beach"}'::jsonb
FROM public.itineraries WHERE title = 'Beach Days';

-- MUST FAIL — UNIQUE (itinerary_id, place_id)
INSERT INTO public.itinerary_items
  (itinerary_id, place_id, place_kind, place_ref, day_index)
SELECT id, 'beach:3', 'beach', '3', 1
FROM public.itineraries WHERE title = 'Beach Days';

-- MUST FAIL — day_index above the 14-day cap
INSERT INTO public.itinerary_items
  (itinerary_id, place_id, place_kind, place_ref, day_index)
SELECT id, 'beach:9', 'beach', '9', 14
FROM public.itineraries WHERE title = 'Beach Days';

-- MUST FAIL — place_id regex
INSERT INTO public.itinerary_items
  (itinerary_id, place_id, place_kind, place_ref)
SELECT id, 'NotAPlaceId', 'beach', '3'
FROM public.itineraries WHERE title = 'Beach Days';

-- MUST SUCCEED — kayak is an accepted kind (the set favorites is missing)
INSERT INTO public.itinerary_items
  (itinerary_id, place_id, place_kind, place_ref)
SELECT id, 'kayak:1', 'kayak', '1'
FROM public.itineraries WHERE title = 'Beach Days';

-- Cascade: deleting the trip must remove its items. Expect 0.
DELETE FROM public.itineraries WHERE title IN ('Beach Days', 'Someday');
SELECT count(*) AS orphans FROM public.itinerary_items
WHERE itinerary_id NOT IN (SELECT id FROM public.itineraries);
```

Expected final row: `orphans = 0`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0045_itineraries.sql
git commit -m "Trip planner: itineraries + itinerary_items schema with RLS"
```

---

## Task 2: Backend — shared helpers and `kayak` fix

**Files:**
- Modify: `backend/server.js` (the `PLACE_KINDS` set and `parsePlaceId` /
  `shapeSnapshot` around lines 1377–1416)

**Interfaces:**
- Consumes: Task 1's tables
- Produces: `export { parsePlaceId, shapeSnapshot, PLACE_KINDS }` from
  `backend/server.js`, importable by `backend/itineraries.js`.
  - `parsePlaceId(raw) -> { id, kind, ref } | null`
  - `shapeSnapshot(input) -> { kind, name, subtitle, latitude, longitude, tags, icon }`

- [ ] **Step 1: Add `kayak` to `PLACE_KINDS`**

This is a live bug, not new work: `frontend/src/lib/place.ts` declares `kayak`
as a `PlaceKind`, and `db/migrations/0032_favorites.sql` accepts it, but the
route's guard set omits it — so saving a kayak spot 400s today. The new tables
accept all ten kinds, and the planner must not inherit the gap.

In `backend/server.js`, change the set to:

```js
const PLACE_KINDS = new Set([
  'beach', 'restaurant', 'stay', 'activity', 'service',
  'transport', 'essential', 'snorkel', 'kayak', 'trail',
])
```

- [ ] **Step 2: Export the three helpers**

`parsePlaceId` and `shapeSnapshot` are currently module-private. The itinerary
routes need exactly the same parsing and the same whitelist — duplicating them
would guarantee the two copies drift. Add `export` to each declaration:

```js
export const PLACE_KINDS = new Set([ /* ...as above... */ ])

/** Split 'beach:3' into its parts, or null if it isn't a valid Place.id. */
export function parsePlaceId(raw) { /* unchanged body */ }

export function shapeSnapshot(input) { /* unchanged body */ }
```

Leave every existing call site untouched — adding `export` to a declaration does
not change its local behaviour.

- [ ] **Step 3: Verify the server still parses and boots**

```bash
cd "/home/giancarlo/Desktop/Vieques AI"
node --check backend/server.js
```

Expected: no output (exit 0).

- [ ] **Step 4: Verify the kayak fix end to end**

Start the backend and save a kayak place with a real user JWT:

```bash
curl -s -X PUT "$API/api/favorites/kayak:1" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"snapshot":{"kind":"kayak","name":"Puerto Mosquito"}}' | head -c 300
```

Expected: a JSON favorite row, **not** a 400. Before this task the same call
returns a 400 invalid-place-id error.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "Backend: export place-id helpers, accept kayak as a place kind

parsePlaceId/shapeSnapshot are about to be shared with the itinerary
routes; duplicating the snapshot whitelist would let the two copies
drift. PLACE_KINDS was also missing 'kayak', which the PlaceKind type
and the favorites table both allow — saving a kayak spot 400s today."
```

---

## Task 3: Backend — the six itinerary routes

**Files:**
- Create: `backend/itineraries.js`
- Modify: `backend/server.js` (mount the router)

**Interfaces:**
- Consumes: `parsePlaceId`, `shapeSnapshot` (Task 2); `requireAuth`,
  `requireTier` from `./middleware.js`
- Produces: `export function mountItineraries(app, pool)` and these six routes:

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/itineraries` | — | `Trip[]` (no items) |
| POST | `/api/itineraries` | `{title, startDate?, endDate?}` | `Trip` |
| PATCH | `/api/itineraries/:id` | `{title?, startDate?, endDate?}` | `Trip` |
| DELETE | `/api/itineraries/:id` | — | `204` |
| GET | `/api/itineraries/:id` | — | `TripDetail` |
| PUT | `/api/itineraries/:id/items` | see step 1 | `TripDetail` |

Wire shapes (these exact key names are what Task 4 types and Task 5 consumes):

```
Trip       = { id, title, startDate|null, endDate|null, itemCount, updatedAt }
TripItem   = { placeId, placeKind, placeRef, dayIndex|null, sortOrder, snapshot }
TripDetail = Trip & { items: TripItem[] }
```

- [ ] **Step 1: Write the router**

```js
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
      console.error('[itineraries:list]', e)
      res.status(500).json({ error: 'Could not load your trips.' })
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
      console.error('[itineraries:create]', e)
      res.status(500).json({ error: 'Could not create the trip.' })
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
      res.json(toTrip(rows[0]))
    } catch (e) {
      console.error('[itineraries:update]', e)
      res.status(500).json({ error: 'Could not save the trip.' })
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
      console.error('[itineraries:delete]', e)
      res.status(500).json({ error: 'Could not delete the trip.' })
    }
  })

  // ---- DETAIL ---------------------------------------------------------
  app.get('/api/itineraries/:id', ...gate, async (req, res) => {
    try {
      const detail = await loadDetail(req.params.id, req.user.id)
      if (!detail) return res.status(404).json({ error: 'Trip not found.' })
      res.json(detail)
    } catch (e) {
      console.error('[itineraries:detail]', e)
      res.status(500).json({ error: 'Could not load the trip.' })
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
      console.error('[itineraries:items]', e)
      res.status(500).json({ error: 'Could not update the trip.' })
    }
  })
}
```

- [ ] **Step 2: Mount the router in `server.js`**

Add the import beside the other local imports at the top:

```js
import { mountItineraries } from './itineraries.js'
```

Then, after the favorites routes are defined (near the end of the route
definitions, before any 404 handler), add:

```js
mountItineraries(app, pool)
```

`itineraries.js` imports from `server.js` and `server.js` imports from
`itineraries.js` — an ES module cycle. This is safe because the helper
functions are hoisted function declarations and `mountItineraries` is only
*called* after both modules have finished evaluating. If Node reports a
`ReferenceError` on `parsePlaceId`, move `mountItineraries(app, pool)` later in
the file rather than converting the helpers to `const` arrow functions.

- [ ] **Step 3: Verify both files parse**

```bash
cd "/home/giancarlo/Desktop/Vieques AI"
node --check backend/itineraries.js && node --check backend/server.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Exercise every route**

Start the backend locally. With `$JWT` for an **Exploration-tier** user:

```bash
API=http://localhost:3000
AUTH="Authorization: Bearer $JWT"
JSON='Content-Type: application/json'

# create
TRIP=$(curl -s -X POST "$API/api/itineraries" -H "$AUTH" -H "$JSON" \
  -d '{"title":"Beach Days","startDate":"2026-03-03","endDate":"2026-03-07"}')
echo "$TRIP"
ID=$(echo "$TRIP" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

# list — itemCount must be 0
curl -s "$API/api/itineraries" -H "$AUTH"

# add an item to day 0
curl -s -X PUT "$API/api/itineraries/$ID/items" -H "$AUTH" -H "$JSON" \
  -d '{"action":"add","placeId":"beach:3","dayIndex":0,
       "snapshot":{"kind":"beach","name":"Caracas Beach","latitude":18.1,"longitude":-65.5}}'

# add the SAME place again — must not duplicate (items length stays 1)
curl -s -X PUT "$API/api/itineraries/$ID/items" -H "$AUTH" -H "$JSON" \
  -d '{"action":"add","placeId":"beach:3","dayIndex":0,"snapshot":{"name":"Caracas Beach"}}'

# move it to day 2
curl -s -X PUT "$API/api/itineraries/$ID/items" -H "$AUTH" -H "$JSON" \
  -d '{"action":"move","placeId":"beach:3","dayIndex":2}'

# rename + shorten to 3 days; the day-2 item stays at dayIndex 2 in the data
curl -s -X PATCH "$API/api/itineraries/$ID" -H "$AUTH" -H "$JSON" \
  -d '{"title":"Beach Days v2","startDate":"2026-03-03","endDate":"2026-03-05"}'

# rejections — each must be 400 with a readable message
curl -s -X POST "$API/api/itineraries" -H "$AUTH" -H "$JSON" \
  -d '{"title":"","startDate":null,"endDate":null}'
curl -s -X POST "$API/api/itineraries" -H "$AUTH" -H "$JSON" \
  -d '{"title":"Too Long","startDate":"2026-03-01","endDate":"2026-03-20"}'
curl -s -X POST "$API/api/itineraries" -H "$AUTH" -H "$JSON" \
  -d '{"title":"Half","startDate":"2026-03-01","endDate":null}'
curl -s -X PUT "$API/api/itineraries/$ID/items" -H "$AUTH" -H "$JSON" \
  -d '{"action":"add","placeId":"bogus","dayIndex":0}'

# delete, then confirm it is gone
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$API/api/itineraries/$ID" -H "$AUTH"
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/itineraries/$ID" -H "$AUTH"
```

Expected: create `201`; duplicate add leaves `items.length === 1`; the three
bad creates and the bad place id all return `400` with the exact sentences from
`validateTrip`; delete `204`; the follow-up GET `404`.

- [ ] **Step 5: Verify the tier gate and cross-user isolation**

```bash
# Free-tier JWT — every route must 402
curl -s -o /dev/null -w 'list %{http_code}\n' "$API/api/itineraries" -H "Authorization: Bearer $FREE_JWT"
curl -s -o /dev/null -w 'create %{http_code}\n' -X POST "$API/api/itineraries" \
  -H "Authorization: Bearer $FREE_JWT" -H "$JSON" -d '{"title":"Nope"}'

# User B cannot read or delete user A's trip
curl -s -o /dev/null -w 'read-other %{http_code}\n' "$API/api/itineraries/$A_TRIP_ID" -H "Authorization: Bearer $B_JWT"
curl -s -o /dev/null -w 'del-other %{http_code}\n' -X DELETE "$API/api/itineraries/$A_TRIP_ID" -H "Authorization: Bearer $B_JWT"
```

Expected: `402` for both free-tier calls; `404` (never `200` or `204`) for both
cross-user calls.

- [ ] **Step 6: Commit**

```bash
git add backend/itineraries.js backend/server.js
git commit -m "Trip planner: six itinerary routes behind the Exploration gate"
```

---

## Task 4: Client API layer

**Files:**
- Modify: `frontend/src/lib/api.ts` (append after the favorites helpers at the
  end of the file)

**Interfaces:**
- Consumes: Task 3's routes and their exact wire shapes
- Produces:
  - `export type Trip = { id, title, startDate, endDate, itemCount, updatedAt }`
  - `export type TripItem = { placeId, placeKind, placeRef, dayIndex, sortOrder, snapshot }`
  - `export type TripDetail = Trip & { items: TripItem[] }`
  - `fetchTrips(): Promise<Trip[]>`
  - `fetchTrip(id): Promise<TripDetail>`
  - `createTrip(input): Promise<Trip>`
  - `updateTrip(id, input): Promise<Trip>`
  - `deleteTrip(id): Promise<void>`
  - `mutateTripItem(id, body): Promise<TripDetail>`
  - `tripDayCount(t): number`
  - `tripDayDate(t, i): Date | null`
  - `formatDateRange(t): string`

- [ ] **Step 1: Append the types and wrappers**

Match the existing file's idiom — these use the same `api()` helper and
`ApiError` as `fetchFavorites`.

```ts
// ----------------------------------------------------------------------------
//  TRIP PLANNER
// ----------------------------------------------------------------------------

/** Snapshot of a place as stored on a trip item — the card, not the record. */
export type TripSnapshot = {
  kind?: string
  name?: string
  subtitle?: string
  latitude?: number | null
  longitude?: number | null
  tags?: string[]
  icon?: { emoji?: string; color?: string }
}

export type Trip = {
  id: string
  title: string
  /** ISO yyyy-mm-dd, or null for a dateless "someday" list. */
  startDate: string | null
  endDate: string | null
  itemCount: number
  updatedAt: string
}

export type TripItem = {
  placeId: string
  placeKind: string
  placeRef: string
  /** null = Unscheduled. May exceed the trip's current length — see below. */
  dayIndex: number | null
  sortOrder: number
  snapshot: TripSnapshot
}

export type TripDetail = Trip & { items: TripItem[] }

export type TripInput = {
  title: string
  startDate?: string | null
  endDate?: string | null
}

export type TripItemMutation = {
  action: 'add' | 'move' | 'remove'
  placeId: string
  dayIndex?: number | null
  snapshot?: TripSnapshot
}

export async function fetchTrips(): Promise<Trip[]> {
  const r = await api('/api/itineraries')
  if (!r.ok) throw await ApiError.from(r)
  return r.json()
}

export async function fetchTrip(id: string): Promise<TripDetail> {
  const r = await api(`/api/itineraries/${encodeURIComponent(id)}`)
  if (!r.ok) throw await ApiError.from(r)
  return r.json()
}

export async function createTrip(input: TripInput): Promise<Trip> {
  const r = await api('/api/itineraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw await ApiError.from(r)
  return r.json()
}

export async function updateTrip(id: string, input: Partial<TripInput>): Promise<Trip> {
  const r = await api(`/api/itineraries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!r.ok) throw await ApiError.from(r)
  return r.json()
}

export async function deleteTrip(id: string): Promise<void> {
  const r = await api(`/api/itineraries/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok) throw await ApiError.from(r)
}

export async function mutateTripItem(
  id: string,
  body: TripItemMutation,
): Promise<TripDetail> {
  const r = await api(`/api/itineraries/${encodeURIComponent(id)}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw await ApiError.from(r)
  return r.json()
}

// ---- date helpers -----------------------------------------------------------
//  Dates are parsed as UTC noon, never local midnight. `new Date('2026-03-03')`
//  is UTC midnight, which in Puerto Rico (UTC-4) is 8pm on March 2 — so a naive
//  local render shows every trip starting the day before it does. Noon is far
//  enough from both boundaries that no timezone shifts the calendar day.

function atNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

/** How many day sections a trip has. 0 when it is dateless. */
export function tripDayCount(t: Pick<Trip, 'startDate' | 'endDate'>): number {
  if (!t.startDate || !t.endDate) return 0
  const days = Math.round(
    (atNoon(t.endDate).getTime() - atNoon(t.startDate).getTime()) / 86400000,
  ) + 1
  return days > 0 ? days : 0
}

/** The calendar date of day `i` (0-based), or null on a dateless trip. */
export function tripDayDate(
  t: Pick<Trip, 'startDate' | 'endDate'>,
  i: number,
): Date | null {
  if (!t.startDate) return null
  const d = atNoon(t.startDate)
  d.setUTCDate(d.getUTCDate() + i)
  return d
}

/** "Mar 3–7" · "Mar 30 – Apr 2" · "No dates" */
export function formatDateRange(t: Pick<Trip, 'startDate' | 'endDate'>): string {
  if (!t.startDate || !t.endDate) return 'No dates'
  const a = atNoon(t.startDate)
  const b = atNoon(t.endDate)
  const mon = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = (d: Date) => d.getUTCDate()
  if (t.startDate === t.endDate) return `${mon(a)} ${day(a)}`
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${mon(a)} ${day(a)}–${day(b)}`
    : `${mon(a)} ${day(a)} – ${mon(b)} ${day(b)}`
}
```

- [ ] **Step 2: Verify it typechecks**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0, no output.

- [ ] **Step 3: Verify the date helpers against the timezone trap**

The Puerto Rico offset is the bug this guards. Run:

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend"
TZ=America/Puerto_Rico node --input-type=module -e '
const atNoon = (iso) => new Date(`${iso}T12:00:00Z`)
const count = (s,e) => Math.round((atNoon(e)-atNoon(s))/86400000)+1
const dayDate = (s,i) => { const d = atNoon(s); d.setUTCDate(d.getUTCDate()+i); return d }
const fmt = (d) => d.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"})
console.log("count Mar3-Mar7 =", count("2026-03-03","2026-03-07"), "(expect 5)")
console.log("count same day  =", count("2026-03-03","2026-03-03"), "(expect 1)")
console.log("day 0 =", fmt(dayDate("2026-03-03",0)), "(expect Mar 3)")
console.log("day 4 =", fmt(dayDate("2026-03-03",4)), "(expect Mar 7)")
console.log("month roll =", fmt(dayDate("2026-03-30",3)), "(expect Apr 2)")
'
```

Expected exactly: `5`, `1`, `Mar 3`, `Mar 7`, `Apr 2`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "Trip planner: client API wrappers and UTC-safe date helpers"
```

---

## Task 5: The `useItineraries` hook

**Files:**
- Create: `frontend/src/hooks/useItineraries.ts`

**Interfaces:**
- Consumes: everything Task 4 produced
- Produces: `useItineraries(): Itineraries` where

```ts
type Itineraries = {
  trips: Trip[]
  loading: boolean
  activeTrip: TripDetail | null
  activeLoading: boolean
  error: string | null
  open: (id: string) => Promise<void>
  close: () => void
  create: (input: TripInput) => Promise<Trip | null>
  rename: (id: string, input: Partial<TripInput>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  addPlace: (tripId: string, place: Place, dayIndex: number | null) => Promise<boolean>
  movePlace: (placeId: string, dayIndex: number | null) => Promise<boolean>
  removePlace: (placeId: string) => Promise<boolean>
  clearError: () => void
}
```

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useState } from 'react'

import {
  createTrip, deleteTrip, fetchTrip, fetchTrips, mutateTripItem, updateTrip,
  ApiError, type Trip, type TripDetail, type TripInput,
} from '../lib/api'
import { placeSnapshot, type Place } from '../lib/place'

/**
 * The user's trips.
 *
 * Optimistic in the same places useFavorites is and for the same reason: on one
 * bar of LTE a planner that waits for a round trip before showing a change
 * reads as broken. Failure rolls back and surfaces a sentence rather than
 * leaving a lie on screen.
 *
 * Item mutations are the exception — they are NOT optimistic. The server
 * returns the whole refreshed TripDetail, which is what the map needs to redraw
 * pins; reconstructing that locally would duplicate the sort_order logic in the
 * route for no gain on an action that happens once per place.
 *
 * A failed load resolves to an empty list, not an error screen. The planner is
 * additive: a user who cannot reach it still has the whole map.
 */
export type Itineraries = {
  trips: Trip[]
  loading: boolean
  activeTrip: TripDetail | null
  activeLoading: boolean
  error: string | null
  open: (id: string) => Promise<void>
  close: () => void
  create: (input: TripInput) => Promise<Trip | null>
  rename: (id: string, input: Partial<TripInput>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  addPlace: (tripId: string, place: Place, dayIndex: number | null) => Promise<boolean>
  movePlace: (placeId: string, dayIndex: number | null) => Promise<boolean>
  removePlace: (placeId: string) => Promise<boolean>
  clearError: () => void
}

/** Pull a readable sentence out of whatever the API threw. */
function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError && e.message) return e.message
  return fallback
}

export function useItineraries(): Itineraries {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTrip, setActiveTrip] = useState<TripDetail | null>(null)
  const [activeLoading, setActiveLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchTrips()
      .then((t) => live && setTrips(t))
      .catch(() => {
        /* empty list is the right fallback — see the note above */
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const open = useCallback(async (id: string) => {
    setActiveLoading(true)
    setError(null)
    try {
      setActiveTrip(await fetchTrip(id))
    } catch (e) {
      setError(messageOf(e, 'Could not open that trip.'))
      setActiveTrip(null)
    } finally {
      setActiveLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    setActiveTrip(null)
    setError(null)
  }, [])

  const create = useCallback(async (input: TripInput) => {
    setError(null)
    try {
      const t = await createTrip(input)
      setTrips((prev) => [t, ...prev])
      return t
    } catch (e) {
      setError(messageOf(e, 'Could not create the trip.'))
      return null
    }
  }, [])

  const rename = useCallback(async (id: string, input: Partial<TripInput>) => {
    const before = trips
    // Optimistic: the header should show the new name as the sheet closes.
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...input } as Trip : t)))
    setActiveTrip((a) => (a && a.id === id ? { ...a, ...input } as TripDetail : a))
    try {
      const t = await updateTrip(id, input)
      setTrips((prev) => prev.map((p) => (p.id === id ? t : p)))
      setActiveTrip((a) => (a && a.id === id ? { ...a, ...t } : a))
      return true
    } catch (e) {
      setTrips(before)
      setError(messageOf(e, 'Could not save the trip.'))
      return false
    }
  }, [trips])

  const remove = useCallback(async (id: string) => {
    const before = trips
    setTrips((prev) => prev.filter((t) => t.id !== id))
    setActiveTrip((a) => (a && a.id === id ? null : a))
    try {
      await deleteTrip(id)
      return true
    } catch (e) {
      setTrips(before)
      setError(messageOf(e, 'Could not delete the trip.'))
      return false
    }
  }, [trips])

  /** Apply a server-returned detail to both the active trip and the list count. */
  const applyDetail = useCallback((detail: TripDetail) => {
    setActiveTrip((a) => (a && a.id === detail.id ? detail : a))
    setTrips((prev) =>
      prev.map((t) =>
        t.id === detail.id
          ? { ...t, itemCount: detail.items.length, updatedAt: detail.updatedAt }
          : t,
      ),
    )
  }, [])

  const addPlace = useCallback(
    async (tripId: string, place: Place, dayIndex: number | null) => {
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(tripId, {
            action: 'add',
            placeId: place.id,
            dayIndex,
            snapshot: placeSnapshot(place),
          }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not add that place.'))
        return false
      }
    },
    [applyDetail],
  )

  const movePlace = useCallback(
    async (placeId: string, dayIndex: number | null) => {
      if (!activeTrip) return false
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(activeTrip.id, { action: 'move', placeId, dayIndex }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not move that place.'))
        return false
      }
    },
    [activeTrip, applyDetail],
  )

  const removePlace = useCallback(
    async (placeId: string) => {
      if (!activeTrip) return false
      setError(null)
      try {
        applyDetail(
          await mutateTripItem(activeTrip.id, { action: 'remove', placeId }),
        )
        return true
      } catch (e) {
        setError(messageOf(e, 'Could not remove that place.'))
        return false
      }
    },
    [activeTrip, applyDetail],
  )

  return {
    trips, loading, activeTrip, activeLoading, error,
    open, close, create, rename, remove,
    addPlace, movePlace, removePlace, clearError,
  }
}
```

- [ ] **Step 2: Confirm `ApiError` exposes `.message`**

```bash
cd "/home/giancarlo/Desktop/Vieques AI"
grep -n "class ApiError" -A 20 frontend/src/lib/api.ts
```

If `ApiError` has no usable `.message`, adapt `messageOf` to read whatever field
it does carry (e.g. `.body?.error`). Do not invent a field.

- [ ] **Step 3: Typecheck**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useItineraries.ts
git commit -m "Trip planner: useItineraries hook"
```

---

## Task 6: `TripForm` — create and edit

**Files:**
- Create: `frontend/src/components/TripForm.tsx`

**Interfaces:**
- Consumes: `TripInput`, `Trip`, `tripDayCount` (Task 4)
- Produces: default export
  `TripForm({ initial?, onSubmit, onCancel, submitting, error })`
  where `onSubmit: (input: TripInput) => void`

- [ ] **Step 1: Write the component**

Every control the user needs: a name field, two date inputs, a live day-count
readout, a clear-dates escape hatch, and both buttons.

```tsx
import { useState } from 'react'

import { tripDayCount, type Trip, type TripInput } from '../lib/api'

type Props = {
  /** Present when editing; absent when creating. */
  initial?: Pick<Trip, 'title' | 'startDate' | 'endDate'>
  onSubmit: (input: TripInput) => void
  onCancel: () => void
  submitting?: boolean
  /** Server-side message, e.g. "Trips can span at most 14 days." */
  error?: string | null
}

const MAX_DAYS = 14

/**
 * Create / edit a trip, rendered inline in the pane rather than as a modal —
 * the sheet is the app's single display surface and a dialog over a dialog on a
 * phone is a stacking problem with no upside.
 *
 * The day count is derived and shown live, so "Mar 3 – Mar 20" fails visibly
 * while the user is still looking at the dates rather than after a round trip.
 */
export default function TripForm({
  initial, onSubmit, onCancel, submitting = false, error,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')

  const bothOrNeither = (!startDate) === (!endDate)
  const days = startDate && endDate ? tripDayCount({ startDate, endDate }) : 0
  const tooLong = days > MAX_DAYS
  const backwards = Boolean(startDate && endDate && days < 1)
  const named = title.trim().length > 0

  // Client-side twin of validateTrip in backend/itineraries.js. The server is
  // still the authority; this exists so the button is disabled before the trip.
  const localError = !bothOrNeither
    ? 'Pick both a start and an end date, or neither.'
    : backwards
      ? 'The end date comes before the start date.'
      : tooLong
        ? `Trips can span at most ${MAX_DAYS} days.`
        : null

  const valid = named && !localError
  const shown = localError ?? error ?? null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || submitting) return
    onSubmit({
      title: title.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
    })
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm ' +
    'text-foreground outline-none placeholder:text-muted-foreground ' +
    'focus:border-primary/60 focus:ring-1 focus:ring-primary/40 ' +
    '[color-scheme:dark]'

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-contain scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Trip name
          </span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Beach Days"
            aria-label="Trip name"
            className={`mt-1.5 ${field}`}
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Arrive
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value
                setStartDate(v)
                // Keep the range sane as they type: an end before the new start
                // is never what they meant.
                if (v && endDate && endDate < v) setEndDate(v)
              }}
              aria-label="Arrival date"
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Depart
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Departure date"
              className={`mt-1.5 ${field}`}
            />
          </label>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {days > 0 && !tooLong
              ? `${days} day${days === 1 ? '' : 's'} to plan`
              : 'Dates are optional — skip them for a list you fill in later.'}
          </p>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate('') }}
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear dates
            </button>
          )}
        </div>

        {shown && (
          <p role="alert" className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {shown}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-white/8 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create trip'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TripForm.tsx
git commit -m "Trip planner: TripForm — name, date range, live day count"
```

---

## Task 7: `TripDetailBody` — day sections

**Files:**
- Create: `frontend/src/components/TripDetailBody.tsx`

**Interfaces:**
- Consumes: `Itineraries` (Task 5); `tripDayCount`, `tripDayDate`,
  `formatDateRange` (Task 4); `Place`, `PlaceCard`
- Produces: default export `TripDetailBody({ trip, itineraries, onBack, onSelect, onEdit, navPad })`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import {
  formatDateRange, tripDayCount, tripDayDate,
  type TripDetail, type TripItem,
} from '../lib/api'
import { tripItemToPlace, type Place } from '../lib/place'
import PlaceCard from './PlaceCard'

type Props = {
  trip: TripDetail
  itineraries: Itineraries
  onBack: () => void
  onSelect: (p: Place) => void
  onEdit: () => void
  navPad?: boolean
}

/** Buckets keyed by day index, plus `null` for Unscheduled. */
type Bucket = { key: number | null; label: string; sub: string; items: TripItem[] }

/**
 * One trip: its days, and the places in each.
 *
 * Items whose dayIndex exceeds the trip's CURRENT length fall into
 * Unscheduled rather than vanishing — the trip was shortened after they were
 * placed, and deleting the user's work to satisfy a date change would be the
 * wrong trade. Lengthen the trip again and they return to their day.
 */
export default function TripDetailBody({
  trip, itineraries, onBack, onSelect, onEdit, navPad = false,
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const dayCount = tripDayCount(trip)

  const buckets = useMemo<Bucket[]>(() => {
    const out: Bucket[] = []
    for (let i = 0; i < dayCount; i++) {
      const d = tripDayDate(trip, i)
      out.push({
        key: i,
        label: `Day ${i + 1}`,
        sub: d
          ? d.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
            })
          : '',
        items: [],
      })
    }
    const unscheduled: Bucket = { key: null, label: 'Unscheduled', sub: '', items: [] }
    for (const it of trip.items) {
      const i = it.dayIndex
      if (i === null || i >= dayCount) unscheduled.items.push(it)
      else out[i].items.push(it)
    }
    // Unscheduled is hidden only when a dated trip has nothing in it.
    if (unscheduled.items.length > 0 || dayCount === 0) out.push(unscheduled)
    return out
  }, [trip, dayCount])

  const dayOptions = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i),
    [dayCount],
  )

  return (
    <>
      {/* Header: back, title, dates, edit. The trip's details live here, per
          the design — the user can see and change them without leaving. */}
      <div className="flex shrink-0 items-start gap-2 border-b border-white/8 px-3 pb-3 pt-4">
        <button
          onClick={onBack}
          aria-label="Back to trips"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl leading-none tracking-tight">
            {trip.title}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <CalendarDays size={11} />
            {formatDateRange(trip)}
            <span aria-hidden>·</span>
            {trip.items.length} place{trip.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={onEdit}
          aria-label="Edit trip"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <Pencil size={15} />
        </button>
      </div>

      <div
        className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-3 ${
          navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
        }`}
      >
        {trip.items.length === 0 && (
          <div className="px-2 py-10 text-center">
            <CalendarDays size={22} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-foreground">No places yet</p>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              Find a beach, restaurant or activity and use “Add to trip” to drop
              it on a day.
            </p>
          </div>
        )}

        {buckets.map((b) => (
          <section key={b.key ?? 'unscheduled'} className="mb-4 last:mb-0">
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {b.label}
                {b.sub && <span className="ml-1.5 normal-case tracking-normal opacity-70">{b.sub}</span>}
              </h3>
              {b.items.length > 0 && (
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {b.items.length}
                </span>
              )}
            </div>

            {b.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-muted-foreground/70">
                Nothing planned
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {b.items.map((it) => {
                  const place = tripItemToPlace(it)
                  const open = menuFor === it.placeId
                  return (
                    <div key={it.placeId} className="relative">
                      <PlaceCard place={place} selected={false} onSelect={onSelect} />
                      <button
                        onClick={() => setMenuFor(open ? null : it.placeId)}
                        aria-label={`Options for ${place.name}`}
                        aria-expanded={open}
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {open && (
                        <div className="mt-1 rounded-xl border border-white/10 bg-background/95 p-1.5 shadow-xl backdrop-blur">
                          <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Move to
                          </p>
                          <div className="flex flex-wrap gap-1 px-1 pb-1">
                            {dayOptions.map((d) => (
                              <button
                                key={d}
                                onClick={() => {
                                  itineraries.movePlace(it.placeId, d)
                                  setMenuFor(null)
                                }}
                                disabled={it.dayIndex === d}
                                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-foreground hover:bg-white/8 disabled:opacity-35"
                              >
                                Day {d + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                itineraries.movePlace(it.placeId, null)
                                setMenuFor(null)
                              }}
                              disabled={it.dayIndex === null}
                              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-foreground hover:bg-white/8 disabled:opacity-35"
                            >
                              Unscheduled
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              itineraries.removePlace(it.placeId)
                              setMenuFor(null)
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 size={13} />
                            Remove from trip
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Add `tripItemToPlace` to `place.ts`**

The component above needs it. Append to `frontend/src/lib/place.ts`, beside
`favoriteToPlace`:

```ts
import type { TripItem } from './api'

/**
 * A trip item's stored snapshot, rendered as a Place.
 *
 * Same trade as favoriteToPlace: the snapshot is the card, written when the
 * place was added and allowed to go stale. Tapping the row loads the live
 * record.
 */
export function tripItemToPlace(it: TripItem): Place {
  const s = it.snapshot ?? {}
  return {
    id: it.placeId,
    kind: (it.placeKind ?? 'activity') as PlaceKind,
    name: s.name ?? 'Saved place',
    subtitle: s.subtitle,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    tags: Array.isArray(s.tags) ? s.tags : [],
    stats: [],
    contact: {},
    icon: {
      emoji: s.icon?.emoji ?? '📍',
      color: s.icon?.color ?? '#38bdf8',
    },
    raw: s,
  }
}
```

If `place.ts` already imports from `./api`, extend that import rather than
adding a second one.

- [ ] **Step 3: Typecheck**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0. If `Place.raw` is typed narrower than `unknown`, cast the
snapshot to satisfy it rather than widening the `Place` type.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TripDetailBody.tsx frontend/src/lib/place.ts
git commit -m "Trip planner: TripDetailBody with day buckets and a move menu"
```

---

## Task 8: `TripsBody` — the list, and the three-view router

**Files:**
- Create: `frontend/src/components/TripsBody.tsx`

**Interfaces:**
- Consumes: `Itineraries` (5), `TripForm` (6), `TripDetailBody` (7),
  `formatDateRange` (4)
- Produces: default export
  `TripsBody({ itineraries, onSelect, navPad, locked, onUpgrade })`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { CalendarDays, ChevronRight, Lock, Plus, Trash2 } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import { formatDateRange, tripDayCount, type Trip } from '../lib/api'
import type { Place } from '../lib/place'
import { Skeleton } from './ui/skeleton'
import TripDetailBody from './TripDetailBody'
import TripForm from './TripForm'

type Props = {
  itineraries: Itineraries
  onSelect: (p: Place) => void
  navPad?: boolean
  /** Below Exploration: show the upsell instead of the planner. */
  locked?: boolean
  onUpgrade?: () => void
}

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; trip: Trip }

/**
 * The trip planner's top level — and its router.
 *
 * Three views share the one pane (list → detail → place), exactly as the mobile
 * sheet and the desktop left panel both render this same component. The view
 * state is local: ShellMode stays flat at four values, because a trip is
 * somewhere you are *within* Saved, not a fifth thing the app does.
 */
export default function TripsBody({
  itineraries, onSelect, navPad = false, locked = false, onUpgrade,
}: Props) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { trips, loading, activeTrip, activeLoading, error, clearError } = itineraries

  const pad = navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'

  if (locked) {
    return (
      <div className={`flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center ${pad}`}>
        <Lock size={22} className="text-muted-foreground/60" />
        <p className="mt-3 text-sm text-foreground">Trip planning is an Exploration feature</p>
        <p className="mx-auto mt-1.5 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
          Build multi-day plans, drop your saved places onto each day, and see
          the whole trip on the map.
        </p>
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            See Exploration
          </button>
        )}
      </div>
    )
  }

  // ---- view 2: a trip is open ------------------------------------------
  if (activeTrip && view.kind === 'list') {
    return (
      <TripDetailBody
        trip={activeTrip}
        itineraries={itineraries}
        onBack={itineraries.close}
        onSelect={onSelect}
        onEdit={() => setView({ kind: 'edit', trip: activeTrip })}
        navPad={navPad}
      />
    )
  }

  // ---- create / edit forms ---------------------------------------------
  if (view.kind === 'create' || view.kind === 'edit') {
    const editing = view.kind === 'edit' ? view.trip : undefined
    return (
      <>
        <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-4">
          <h2 className="font-display text-xl leading-none tracking-tight">
            {editing ? 'Edit trip' : 'New trip'}
          </h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {editing ? 'Name and dates' : 'Name it, then pick your dates'}
          </p>
        </div>
        <TripForm
          initial={editing}
          submitting={busy}
          error={error}
          onCancel={() => { clearError(); setView({ kind: 'list' }) }}
          onSubmit={async (input) => {
            setBusy(true)
            const ok = editing
              ? await itineraries.rename(editing.id, input)
              : Boolean(await itineraries.create(input))
            setBusy(false)
            if (ok) setView({ kind: 'list' })
          }}
        />
      </>
    )
  }

  // ---- view 1: the list -------------------------------------------------
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 pb-3 pt-4">
        <div>
          <h2 className="font-display text-xl leading-none tracking-tight">Trips</h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {loading ? 'Loading…' : `${trips.length} trip${trips.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => { clearError(); setView({ kind: 'create' }) }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          <Plus size={14} />
          New trip
        </button>
      </div>

      <div className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 ${pad}`}>
        {(loading || activeLoading) &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
          ))}

        {error && !loading && (
          <p role="alert" className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        {!loading && trips.length === 0 && (
          <div className="px-2 py-10 text-center">
            <CalendarDays size={22} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-foreground">No trips yet</p>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              Create one, pick your dates, and drop your saved places onto each
              day.
            </p>
          </div>
        )}

        {!loading && trips.map((t) => {
          const days = tripDayCount(t)
          return (
            <div key={t.id} className="relative">
              <button
                onClick={() => itineraries.open(t.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left hover:bg-white/[0.06]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <CalendarDays size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatDateRange(t)}
                    {days > 0 && ` · ${days} day${days === 1 ? '' : 's'}`}
                    {` · ${t.itemCount} place${t.itemCount === 1 ? '' : 's'}`}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>

              <button
                onClick={() => setConfirmDelete(t.id)}
                aria-label={`Delete ${t.title}`}
                className="absolute right-9 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground/70 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>

              {confirmDelete === t.id && (
                <div className="mt-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs text-foreground">
                    Delete “{t.title}” and everything planned in it?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Keep
                    </button>
                    <button
                      onClick={async () => {
                        await itineraries.remove(t.id)
                        setConfirmDelete(null)
                      }}
                      className="flex-1 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TripsBody.tsx
git commit -m "Trip planner: TripsBody list, create/edit routing, delete confirm"
```

---

## Task 9: `AddToTripSheet` — the picker

**Files:**
- Create: `frontend/src/components/AddToTripSheet.tsx`

**Interfaces:**
- Consumes: `Itineraries` (5), `tripDayCount`/`formatDateRange` (4), `Place`
- Produces: default export `AddToTripSheet({ place, itineraries, onClose })`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { CalendarDays, Check, X } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import { formatDateRange, tripDayCount, type Trip } from '../lib/api'
import type { Place } from '../lib/place'

type Props = {
  place: Place
  itineraries: Itineraries
  onClose: () => void
}

/**
 * "Add to trip" — pick a trip, then a day.
 *
 * Two steps rather than one flat list: a 14-day trip times N trips is too many
 * buttons to scan, and the trip is the choice the user has already made in
 * their head. A dateless trip skips step two entirely.
 */
export default function AddToTripSheet({ place, itineraries, onClose }: Props) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { trips, error } = itineraries

  const commit = async (t: Trip, dayIndex: number | null) => {
    setBusy(true)
    const ok = await itineraries.addPlace(t.id, place, dayIndex)
    setBusy(false)
    if (ok) {
      setDone(true)
      setTimeout(onClose, 700)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-background p-4 pb-[calc(1rem+var(--sab))] shadow-2xl sm:rounded-3xl sm:pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg leading-tight tracking-tight">
              {trip ? `Which day?` : 'Add to trip'}
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {trip ? trip.title : place.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {done && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-300">
            <Check size={15} /> Added to {trip?.title}
          </p>
        )}

        {!done && error && (
          <p role="alert" className="mb-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        {!done && !trip && (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {trips.length === 0 && (
              <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                No trips yet. Create one in Saved → Trips, then add places to it.
              </p>
            )}
            {trips.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => (tripDayCount(t) === 0 ? commit(t, null) : setTrip(t))}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <CalendarDays size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateRange(t)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {!done && trip && (
          <div className="max-h-[50vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: tripDayCount(trip) }, (_, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => commit(trip, i)}
                  className="rounded-xl border border-white/10 px-3.5 py-2 text-sm text-foreground hover:bg-white/8 disabled:opacity-50"
                >
                  Day {i + 1}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() => commit(trip, null)}
                className="rounded-xl border border-dashed border-white/15 px-3.5 py-2 text-sm text-muted-foreground hover:bg-white/8 hover:text-foreground disabled:opacity-50"
              >
                Unscheduled
              </button>
            </div>
            <button
              onClick={() => setTrip(null)}
              className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              ‹ Pick a different trip
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AddToTripSheet.tsx
git commit -m "Trip planner: AddToTripSheet trip + day picker"
```

---

## Task 10: `SavedBody` gains the `Places | Trips` segment

**Files:**
- Modify: `frontend/src/components/SavedBody.tsx`

**Interfaces:**
- Consumes: `TripsBody` (8), `Itineraries` (5)
- Produces: `SavedBody` with three new props — `itineraries: Itineraries`,
  `tripsLocked?: boolean`, `onUpgrade?: () => void` — and a `segment` state
  defaulting to `'trips'`.

- [ ] **Step 1: Rewrite the component**

The existing header and the places list are preserved exactly; they move under
a segment control, and Trips becomes the default because the planner is the
main reason to open Saved.

```tsx
import { useState } from 'react'
import { Heart } from 'lucide-react'

import type { Favorites } from '../hooks/useFavorites'
import type { Itineraries } from '../hooks/useItineraries'
import type { Place } from '../lib/place'
import PlaceCard from './PlaceCard'
import TripsBody from './TripsBody'
import { Skeleton } from './ui/skeleton'

type Props = {
  favorites: Favorites
  itineraries: Itineraries
  selectedId: string | null
  onSelect: (p: Place) => void
  distances: Map<string, number>
  /** Desktop only. */
  onClose?: () => void
  /** Mobile: clear the bottom nav with the scroller's bottom padding. */
  navPad?: boolean
  /** Below Exploration — Trips shows the upsell. */
  tripsLocked?: boolean
  onUpgrade?: () => void
  /** Per-place "add to trip". */
  onAddToTrip?: (p: Place) => void
}

type Segment = 'places' | 'trips'

/**
 * Saved — two segments over one surface.
 *
 * `places` is the original heart list; `trips` is the planner. They live
 * together because the flow that makes either useful is "save a place, then
 * drop it on a day", and splitting them across the nav would put a hop in the
 * middle of it. Trips is the default: the planner is the reason to come here.
 *
 * Identical on both platforms — this component is what the mobile sheet renders
 * and what the desktop left panel renders, so the planner needed no separate
 * desktop implementation.
 */
export default function SavedBody({
  favorites, itineraries, selectedId, onSelect, distances,
  onClose, navPad = false, tripsLocked = false, onUpgrade, onAddToTrip,
}: Props) {
  const [segment, setSegment] = useState<Segment>('trips')
  const { places, loading, toggle } = favorites

  const tab = (id: Segment, label: string, count?: number) => (
    <button
      key={id}
      onClick={() => setSegment(id)}
      aria-pressed={segment === id}
      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        segment === id
          ? 'bg-white/10 text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}</span>
      )}
    </button>
  )

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-white/[0.04] p-1">
          {tab('trips', 'Trips', itineraries.trips.length)}
          {tab('places', 'Places', places.length)}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close saved"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {segment === 'trips' ? (
        <TripsBody
          itineraries={itineraries}
          onSelect={onSelect}
          navPad={navPad}
          locked={tripsLocked}
          onUpgrade={onUpgrade}
        />
      ) : (
        <>
          <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-3">
            <h2 className="font-display text-xl leading-none tracking-tight">Saved</h2>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {loading ? 'Loading…' : `${places.length} place${places.length === 1 ? '' : 's'}`}
            </p>
          </div>

          <div
            className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 ${
              navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
            }`}
          >
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
              ))}

            {!loading && places.length === 0 && (
              <div className="px-2 py-10 text-center">
                <Heart size={22} className="mx-auto text-muted-foreground/50" />
                <p className="mt-3 text-sm text-foreground">Nothing saved yet</p>
                <p className="mx-auto mt-1.5 max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
                  Tap the heart on any beach, restaurant or stay to keep it here.
                </p>
              </div>
            )}

            {!loading &&
              places.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  selected={p.id === selectedId}
                  onSelect={onSelect}
                  distanceMi={distances.get(p.id)}
                  saved
                  onToggleSave={toggle}
                  onAddToTrip={onAddToTrip}
                />
              ))}
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Typecheck (expect failures — that is the point)**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: errors at `MapView.tsx` (both `SavedBody` call sites now missing
`itineraries`) and at `PlaceCard` (`onAddToTrip` not yet a prop). Tasks 11 and
12 fix these. Do **not** commit while red.

- [ ] **Step 3: Add `onAddToTrip` to `PlaceCard`**

In `frontend/src/components/PlaceCard.tsx`, add to its `Props`:

```tsx
  /** Optional "add to trip" affordance, beside the heart. */
  onAddToTrip?: (p: Place) => void
```

And render it next to the existing heart button — matching that button's
size and hover treatment:

```tsx
{onAddToTrip && (
  <button
    onClick={(e) => { e.stopPropagation(); onAddToTrip(place) }}
    aria-label={`Add ${place.name} to a trip`}
    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/8 hover:text-foreground"
  >
    <CalendarPlus size={15} />
  </button>
)}
```

Import `CalendarPlus` from `lucide-react` alongside the existing icon imports.
Place the button in the same flex row as the heart, before it, so the heart
stays the rightmost control it is today.

- [ ] **Step 4: Typecheck again**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npx tsc -b --pretty false
```

Expected: only the `MapView.tsx` errors remain (missing `itineraries` prop).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SavedBody.tsx frontend/src/components/PlaceCard.tsx
git commit -m "Saved: Places | Trips segments, add-to-trip on place cards

Trips is the default segment — the planner is the reason to open Saved.
Both platforms render this same component (mobile sheet and desktop left
panel), so the planner needs no separate desktop implementation.

MapView is red until the next task supplies the itineraries prop."
```

---

## Task 11: Wire `MapView` — pins, props, and the dead toast

**Files:**
- Modify: `frontend/src/components/MapView.tsx`
- Modify: `frontend/src/components/MapTopBar.tsx`

**Interfaces:**
- Consumes: everything above
- Produces: a working feature on both platforms

- [ ] **Step 1: Instantiate the hook**

Near the existing `const favorites = useFavorites()` in `MapView`:

```tsx
const itineraries = useItineraries()
const canPlanTrips = useFeature('itinerary')
const [addToTripFor, setAddToTripFor] = useState<Place | null>(null)
```

`useFeature` is already imported in this file (line 47) and already used as
`const canWaterZones = useFeature('snorkel_zones')` — match that idiom exactly.
Add the two new imports:

```tsx
import { useItineraries } from '../hooks/useItineraries'
import AddToTripSheet from './AddToTripSheet'
```

- [ ] **Step 2: Pass the new props to BOTH `SavedBody` call sites**

There are two — the mobile sheet body (~line 1134) and the desktop left panel
(~line 1262). Both need the same four additions. **Missing either one leaves
that platform broken**, and TypeScript will only complain about the missing
required prop, not the optional ones.

Mobile:

```tsx
) : mode === 'saved' ? (
  <SavedBody
    favorites={favorites}
    itineraries={itineraries}
    selectedId={null}
    onSelect={selectPlace}
    distances={distances}
    navPad
    tripsLocked={!canPlanTrips}
    onUpgrade={() => { window.location.href = `${LANDING_URL}/pricing` }}
    onAddToTrip={setAddToTripFor}
  />
) : mode === 'profile' ? (
```

Desktop:

```tsx
<SavedBody
  favorites={favorites}
  itineraries={itineraries}
  selectedId={selected?.id ?? null}
  onSelect={selectPlace}
  distances={distances}
  onClose={() => onModeChange('explore')}
  tripsLocked={!canPlanTrips}
  onUpgrade={() => { window.location.href = `${LANDING_URL}/pricing` }}
  onAddToTrip={setAddToTripFor}
/>
```

`canPlanTrips` is the `useFeature('itinerary')` value from Step 1. If the
desktop panel's `title` prop still reads `"Saved"`, leave it — the segment
control names both halves.

- [ ] **Step 3: Render the picker**

Once, near the other overlays at the end of the returned tree, so it is
available from both layouts:

```tsx
{addToTripFor && (
  <AddToTripSheet
    place={addToTripFor}
    itineraries={itineraries}
    onClose={() => setAddToTripFor(null)}
  />
)}
```

- [ ] **Step 4: Drop the active trip's pins on the map**

Find how the existing code renders result pins (grep for the marker loop that
consumes `markerIcon` / `new maplibregl.Marker`). Add an effect that follows the
same pattern for the active trip. Do not invent a second marker system:

```tsx
/**
 * The open trip's places, as pins.
 *
 * Snapshots carry coordinates, so a trip draws its whole map in one pass with
 * no per-place lookup — the reason snapshot exists on the item row. Items with
 * no coordinates (a snapshot written before a place had them) are skipped
 * rather than dropped at 0,0 in the Atlantic.
 */
useEffect(() => {
  const map = mapRef.current
  if (!map || !itineraries.activeTrip) return

  const pts = itineraries.activeTrip.items
    .map((it) => it.snapshot)
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')

  if (pts.length === 0) return

  // markerIcon takes a MarkerStyle whose emoji and color are BOTH required
  // (see frontend/src/lib/markerIcon.ts), so fill each independently — a bare
  // `s.icon ?? {}` does not typecheck.
  const markers = pts.map((s) =>
    new maplibregl.Marker({
      element: markerIcon({
        emoji: s.icon?.emoji ?? '📍',
        color: s.icon?.color ?? '#38bdf8',
      }),
    })
      .setLngLat([s.longitude as number, s.latitude as number])
      .addTo(map),
  )

  const b = new maplibregl.LngLatBounds()
  pts.forEach((s) => b.extend([s.longitude as number, s.latitude as number]))
  map.fitBounds(b, { padding: padding(), maxZoom: 14 })

  return () => markers.forEach((m) => m.remove())
}, [itineraries.activeTrip])
```

Match the real signature of `markerIcon` in `frontend/src/lib/markerIcon.ts` —
read it first and adapt the call. The cleanup returning the markers' removal is
what makes "back clears the pins" work with no extra code.

- [ ] **Step 5: Replace the stub toast**

`onBuildItinerary` currently does `setItineraryNote(true)`. Point it at the real
feature:

```tsx
onBuildItinerary={() => onModeChange('saved')}
```

Then delete the now-dead stub: the `itineraryNote` state declaration
(~line 182) and the whole `{itineraryNote && ( … )}` toast block (~lines
1422–1440), including the `Route` import if nothing else uses it.

- [ ] **Step 6: Update the comment in `MapTopBar.tsx`**

The comment at ~line 128 explains why the menu item is deliberately ungated.
That reasoning is now obsolete — there is something behind the slug. Replace it:

```tsx
{/* Build Itinerary → Saved ▸ Trips. Not gated here: TripsBody renders the
    upsell itself, which keeps the row present on every tier and explains
    what Exploration buys instead of showing a dead lock. */}
```

- [ ] **Step 7: Typecheck and build**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend"
npx tsc -b --pretty false && npx vite build 2>&1 | tail -5
```

Expected: `tsc` exit 0, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/MapView.tsx frontend/src/components/MapTopBar.tsx
git commit -m "Trip planner: wire into MapView on mobile and desktop

Opening a trip drops every place's pin and fits the bounds; the effect's
cleanup is what clears them on back. Build Itinerary now opens Saved ▸
Trips instead of the coming-soon toast, which is deleted."
```

---

## Task 12: Add-to-trip from the place detail panel

**Files:**
- Modify: `frontend/src/components/PlaceDetailPanel.tsx`
- Modify: `frontend/src/components/MapView.tsx` (pass the prop)

- [ ] **Step 1: Add the prop and the button**

In `PlaceDetailPanel.tsx`, add to `Props`:

```tsx
  /** Opens the trip + day picker for this place. */
  onAddToTrip?: (p: Place) => void
```

Render it beside the existing save/directions actions, matching their styling:

```tsx
{onAddToTrip && (
  <button
    onClick={() => onAddToTrip(place)}
    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-foreground hover:bg-white/5"
  >
    <CalendarPlus size={15} />
    Add to trip
  </button>
)}
```

Import `CalendarPlus` from `lucide-react`. Put it in the same action row as
"Get directions" so the panel keeps one row of controls, not two.

- [ ] **Step 2: Pass it from both `PlaceDetailPanel` call sites in `MapView`**

Grep for `<PlaceDetailPanel` — there is a mobile one and a desktop one. Add
`onAddToTrip={setAddToTripFor}` to each.

- [ ] **Step 3: Typecheck and build**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/frontend"
npx tsc -b --pretty false && npx vite build 2>&1 | tail -5
```

Expected: exit 0, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlaceDetailPanel.tsx frontend/src/components/MapView.tsx
git commit -m "Trip planner: add-to-trip from the place detail panel"
```

---

## Task 13: Full manual verification, both platforms

**Files:** none — this task is verification only.

- [ ] **Step 1: Start both servers**

```bash
cd "/home/giancarlo/Desktop/Vieques AI/backend" && npm start   # terminal 1
cd "/home/giancarlo/Desktop/Vieques AI/frontend" && npm run dev -- --host  # terminal 2
```

- [ ] **Step 2: Mobile checks (DevTools at 390×844, iPhone 12 Pro)**

Signed in as an **Exploration** user. Every line must pass:

- [ ] Bottom nav → Saved opens with the **Trips** segment active
- [ ] Segment control switches to **Places** and back; the old heart list is unchanged
- [ ] `+ New trip` opens the form in the pane (not a modal)
- [ ] Typing a name enables Create; an empty name keeps it disabled
- [ ] Picking Mar 3 → Mar 7 shows "5 days to plan"
- [ ] Picking Mar 3 → Mar 20 shows the 14-day error and disables Create
- [ ] Setting an end before the start auto-corrects the end date
- [ ] "Clear dates" empties both fields and the copy reverts to the optional line
- [ ] Creating returns to the list with the new trip showing title, range, `0 places`
- [ ] Explore → a beach → detail → **Add to trip** → pick the trip → pick Day 1 → confirmation
- [ ] Saved → Places → the calendar icon on a row opens the same picker
- [ ] Opening the trip shows Day 1–5 + the place under Day 1, and **its pin is on the map**
- [ ] The map fits to the trip's pins
- [ ] The row's ⋯ menu moves the place to Day 3; it re-renders under Day 3
- [ ] ⋯ → Remove from trip removes it and the count drops
- [ ] Tapping a place row opens its detail panel; back returns to the trip with pins intact
- [ ] `‹` returns to the trip list and **the trip's pins are gone**
- [ ] Pencil → edit → rename → the list and header both show the new name
- [ ] Shorten a 5-day trip to 3 days → items from days 4–5 appear under **Unscheduled**, not deleted
- [ ] Lengthen it back → those items return to their original days
- [ ] Trash → confirm prompt → Delete removes the trip
- [ ] ☰ → Build Itinerary opens Saved ▸ Trips (no "coming soon" toast anywhere)
- [ ] The sheet drags between all three snap points in every trip view without clipping

- [ ] **Step 3: Desktop checks (≥1280px wide)**

- [ ] ☰ → Saved opens the **left panel** at 344px with the Trips segment
- [ ] The whole flow from step 2 works in that panel: create, add, open, move, remove, edit, delete
- [ ] Opening a trip drops its pins and fits bounds, same as mobile
- [ ] Selecting a place opens the right-hand detail panel while the trip stays in the left
- [ ] The panel's × closes back to Explore
- [ ] The left panel does not fight the Explore results panel — only one is visible at a time

- [ ] **Step 4: Tier checks**

- [ ] As a **free** user: Saved → Trips shows the upsell, not the planner
- [ ] "See Exploration" goes to the pricing page
- [ ] Saved → Places still works fully (favorites is ungated)
- [ ] ☰ → Build Itinerary still opens Saved ▸ Trips and shows the upsell there
- [ ] As a **Vacation** user: same upsell (itinerary is Exploration-only)

- [ ] **Step 5: Failure-path checks**

- [ ] Stop the backend, reload, open Saved ▸ Trips → an empty list, no crash, no error screen
- [ ] With the backend down, creating a trip surfaces the error text and keeps the form open
- [ ] Restart the backend; the next action succeeds without a reload

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "Trip planner: fixes from manual verification"
```

---

## Task 14: Final build and review handoff

- [ ] **Step 1: Full verification sweep**

```bash
cd "/home/giancarlo/Desktop/Vieques AI"
node --check backend/server.js
node --check backend/itineraries.js
cd frontend && npx tsc -b --pretty false && npx vite build 2>&1 | tail -5
cd ../landing && npx vite build 2>&1 | tail -3
```

Expected: every command exits 0.

- [ ] **Step 2: Confirm nothing references the removed stub**

```bash
cd "/home/giancarlo/Desktop/Vieques AI"
grep -rn "itineraryNote\|coming soon" --include="*.tsx" --include="*.ts" frontend/src
```

Expected: no hits.

- [ ] **Step 3: Review the diff**

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
```

- [ ] **Step 4: Report to the user and stop**

Do **not** push. Summarize what was built, what was verified with what
evidence, and anything left undone. The user pushes to GitHub after review.

---

## Notes for the implementer

**The single biggest failure mode in this plan is `SavedBody` having two call
sites in `MapView.tsx`.** Mobile (~1134) and desktop (~1262). Update both. The
desktop panel is how the user asked for this to work on a big screen, and it is
easy to miss because the mobile one comes first and satisfies the compiler on
its own for the optional props.

**`PlaceDetailPanel` likewise has two call sites.** Same rule.

**Do not add a fifth `ShellMode`.** Trips is a view inside Saved. The bottom nav
is visually full at four items.

**Line numbers drift.** Every `~line NNN` above is from 2026-08-08. Grep for the
surrounding code rather than trusting the number.

**Reuse, do not reinvent:** `parsePlaceId` and `shapeSnapshot` (backend),
`markerIcon` and the existing marker loop (map), `PlaceCard` (rows), `Skeleton`
(loading), `ResponsivePanel` (desktop shell). Every one of these already exists
and is already styled to match.
