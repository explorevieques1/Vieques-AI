# Itinerary PDF Export & AI Chat History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two Exploration/Vacation features whose slugs already exist in the tier ladder but have no implementation — a server-rendered PDF export of a trip (`itinerary_export`), and saved AI chat conversations with a two-screen panel (`ai_history`).

**Architecture:** The export is one `pdfkit` route in `backend/itineraries.js` that reloads the trip, resolves contact fields with one batched query per place kind, and streams a document. Chat history is two Postgres tables modeled on `itineraries`/`itinerary_items` (per-user RLS on the parent, `EXISTS`-join on the child), written from inside the existing `/api/ai/chat` handler so a paid-for reply is never lost to a second round trip. On the client, `lib/aiChat.tsx` grows conversation state and `AiChatBody` gains a `chat | history` view — and because `AiChatBody` is the shared tree rendered by both the desktop `AiChatPane` and the mobile sheet, neither platform needs its own implementation.

**Tech Stack:** Postgres 15 (Supabase) · Node/Express ESM · pdfkit · React 19 + TypeScript + Vite · Tailwind v4 · Radix + vaul · MapLibre GL

## Global Constraints

- **No test runner exists in this repo.** Verification is SQL assertions run via `psql`/Supabase MCP, `curl` against a local backend, `npx tsc -b`, and explicit manual UI checks. Do not scaffold vitest/jest — adding a test framework is out of scope for this plan.
- **Migration number is `0046`.** `0045_itineraries.sql` is the current highest.
- **Tier gates, exactly:** export routes use `requireTier(pool, 'itinerary_export')` (Exploration only); conversation routes use `requireTier(pool, 'ai_history')` (Vacation and up). Both slugs already exist in `FEATURES` in `backend/payments.js` — do not edit that table.
- **`/api/ai/chat` itself stays gated on credits only** (`requireCredits`), never on `ai_history`. Free tier must keep its 3 lifetime messages; only *persistence* is gated, checked in-handler with `tierHas(req.tier, 'ai_history')`.
- **Persistence must never fail the chat request.** The credit is already spent when the write runs. Wrap every history write so an error is logged and the reply still returns.
- **`phones` is `text[]`** in every listing table. `address` and `hours` are `text`. Beaches, snorkel_spots, kayak_spots and trails have **none** of these columns — see the resolve map in Task 2.
- **Conversation title: 1–80 characters after trimming**, same rule as trip titles.
- **Commit after every task.** Do not push until the whole plan is done and the user has reviewed.
- **Do not restructure `MapView.tsx`** (1556 lines) or `server.js` (1499 lines). Both gain wiring only.
- **Backend `.env` must already have a working `DATABASE_URL`** for any curl verification. Start the backend with `cd backend && npm start`.

---

## File Structure

### Create

| File | Responsibility |
|---|---|
| `db/migrations/0046_ai_conversations.sql` | Two tables, CHECKs, indexes, RLS |
| `backend/itineraryPdf.js` | Kind→table resolve map + `buildTripPdf(doc, trip, resolved)` |
| `backend/aiConversations.js` | Four conversation routes + `persistTurn()`, exported as a mount function |
| `frontend/src/components/AiChatHistoryBody.tsx` | Conversation list, date grouping, ⋯ rename/delete menu |

### Modify

| File | Change |
|---|---|
| `backend/package.json` | Add `pdfkit` dependency |
| `backend/itineraries.js` | Mount the export route |
| `backend/server.js` | Mount the conversations router; call `persistTurn()` in `/api/ai/chat` |
| `frontend/src/lib/api.ts` | Export blob fetcher, conversation fetchers, types |
| `frontend/src/lib/aiChat.tsx` | Conversation state, `newChat`/`openConversation`/`rename`/`delete` |
| `frontend/src/components/AiChatBody.tsx` | `view` state + history toggle in the header |
| `frontend/src/components/TripDetailBody.tsx` | Download button in the header |

---

## Task 1: Chat history schema

**Files:**
- Create: `db/migrations/0046_ai_conversations.sql`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: tables `public.ai_conversations` (`id uuid`, `user_id uuid`, `title text`, `created_at timestamptz`, `updated_at timestamptz`) and `public.ai_messages` (`id uuid`, `conversation_id uuid`, `role text`, `content text`, `pins jsonb`, `seq int`, `created_at timestamptz`)

- [ ] **Step 1: Write the migration**

Create `db/migrations/0046_ai_conversations.sql`:

```sql
-- ============================================================
-- 0046_ai_conversations.sql — saved Ask AI conversations
--
-- MODELED ON 0045_itineraries.sql. Same parent/child split, same
-- per-user RLS on the parent and EXISTS-join RLS on the child.
-- Read that file's header first; the reasoning is identical and is
-- not repeated here.
--
-- WHY seq AND NOT created_at ORDERING
-- -----------------------------------
-- Both messages of a turn are written in one request and can share a
-- timestamptz to the microsecond. A transcript whose order is
-- ambiguous is a transcript that renders the answer above the
-- question, so order is explicit and UNIQUE per conversation.
--
-- WHY pins IS PER-MESSAGE
-- -----------------------
-- Reopening a conversation drops its places back on the map. The pins
-- belong to the assistant message that produced them, so they travel
-- with that reply rather than being recomputed (which would cost
-- another model call) or stored once per conversation (which would
-- lose which answer they came from).
--
-- Gated on 'ai_history' (Vacation and up) in the routes. The free
-- tier still gets its 3 lifetime messages — they are simply not saved.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  -- Always an array. '[]' not NULL so the client never branches on null.
  pins             jsonb NOT NULL DEFAULT '[]'::jsonb,
  seq              int NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

-- The only conversation-list read: this user's, most recently touched first.
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
  ON public.ai_conversations (user_id, updated_at DESC);

-- The only transcript read: one conversation's messages in order.
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON public.ai_messages (conversation_id, seq);

-- ------------------------------------------------------------
-- RLS. Identical in shape to 0045: the user owns the parent outright,
-- and the child proves ownership by joining to it. The EXISTS
-- subquery is on USING *and* WITH CHECK for UPDATE so a message
-- cannot be re-parented into someone else's conversation.
-- ------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own conversations read" ON public.ai_conversations;
CREATE POLICY "own conversations read" ON public.ai_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations insert" ON public.ai_conversations;
CREATE POLICY "own conversations insert" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations update" ON public.ai_conversations;
CREATE POLICY "own conversations update" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations delete" ON public.ai_conversations;
CREATE POLICY "own conversations delete" ON public.ai_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own messages read" ON public.ai_messages;
CREATE POLICY "own messages read" ON public.ai_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages insert" ON public.ai_messages;
CREATE POLICY "own messages insert" ON public.ai_messages
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages update" ON public.ai_messages;
CREATE POLICY "own messages update" ON public.ai_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages delete" ON public.ai_messages;
CREATE POLICY "own messages delete" ON public.ai_messages
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool with name `0046_ai_conversations`, or:

```bash
psql "$DATABASE_URL" -f db/migrations/0046_ai_conversations.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` with no errors.

- [ ] **Step 3: Verify the constraints reject bad rows**

Run each of these. The first must succeed; the rest must all fail.

```sql
-- Setup: any real user id works.
\set uid `psql "$DATABASE_URL" -tAc "SELECT id FROM auth.users LIMIT 1"`

-- 1. A good conversation inserts.
INSERT INTO public.ai_conversations (user_id, title)
VALUES (:'uid', 'Where can I get seafood?') RETURNING id;

-- 2. Empty title is rejected (expect: check constraint violation).
INSERT INTO public.ai_conversations (user_id, title) VALUES (:'uid', '   ');

-- 3. An 81-character title is rejected (expect: check constraint violation).
INSERT INTO public.ai_conversations (user_id, title)
VALUES (:'uid', repeat('x', 81));

-- 4. A bad role is rejected (expect: check constraint violation).
INSERT INTO public.ai_messages (conversation_id, role, content, seq)
VALUES ((SELECT id FROM public.ai_conversations WHERE user_id = :'uid' LIMIT 1),
        'system', 'nope', 0);
```

Expected: insert 1 returns a uuid; inserts 2, 3 and 4 each fail with
`new row for relation ... violates check constraint`.

- [ ] **Step 4: Verify seq uniqueness and the cascade**

```sql
-- Duplicate seq in one conversation is rejected.
WITH c AS (SELECT id FROM public.ai_conversations WHERE user_id = :'uid' LIMIT 1)
INSERT INTO public.ai_messages (conversation_id, role, content, seq)
SELECT c.id, 'user', 'first', 0 FROM c;

WITH c AS (SELECT id FROM public.ai_conversations WHERE user_id = :'uid' LIMIT 1)
INSERT INTO public.ai_messages (conversation_id, role, content, seq)
SELECT c.id, 'user', 'duplicate', 0 FROM c;   -- expect: unique violation

-- Deleting the parent removes the children.
DELETE FROM public.ai_conversations WHERE user_id = :'uid';
SELECT count(*) AS orphans FROM public.ai_messages m
  WHERE NOT EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = m.conversation_id);
```

Expected: the second insert fails with `duplicate key value violates unique
constraint`; the final count is `0`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0046_ai_conversations.sql
git commit -m "Chat history schema: conversations + messages with per-message pins"
```

---

## Task 2: PDF document builder

Pure document logic, split from the route so the route stays about HTTP and
this file stays about layout. No Express, no `pool` — it takes data and a
`PDFDocument` and draws.

**Files:**
- Create: `backend/itineraryPdf.js`
- Modify: `backend/package.json` (add `pdfkit`)

**Interfaces:**
- Consumes: the `TripDetail` shape returned by `loadDetail()` in `backend/itineraries.js` — `{ id, title, startDate, endDate, itemCount, updatedAt, items: [{ placeId, placeKind, placeRef, dayIndex, sortOrder, snapshot }] }`
- Produces:
  - `RESOLVE = { [kind]: { table, columns } }` — the kind→table map
  - `resolveItems(pool, items) -> Promise<Map<string, object>>` keyed by `placeId`
  - `buildTripPdf(doc, trip, resolved) -> void` — draws into an open `PDFDocument`
  - `tripFilename(title) -> string` — slugified, always ends `.pdf`

- [ ] **Step 1: Install pdfkit**

```bash
cd backend && npm install pdfkit@^0.15.1
```

Expected: `added N packages`. Confirm `"pdfkit"` now appears under
`dependencies` in `backend/package.json`.

- [ ] **Step 2: Write the resolve map and helpers**

Create `backend/itineraryPdf.js`:

```js
/**
 * Itinerary PDF — the document, with no HTTP in it.
 *
 * Split from itineraries.js so that file stays about routes and this one
 * stays about layout. Takes an open PDFDocument and draws into it; the
 * caller owns the stream and the response.
 *
 * WHY THIS RESOLVES LIVE DATA
 * ---------------------------
 * The snapshot jsonb written when a place was added holds name, subtitle,
 * tags and coordinates — but NOT address, phone or hours. Those are the
 * fields that make a printed itinerary worth carrying, so the export reads
 * them from the source tables.
 *
 * The "don't fan out" warning in 0045_itineraries.sql is about the MAP
 * RENDER path, which runs constantly. This is a deliberate one-shot export
 * where a few hundred milliseconds is fine — and it is bounded at ten
 * queries (one per kind) regardless of how many places the trip holds.
 */

/**
 * Where each place kind's contact detail lives.
 *
 * Two shapes, and the difference matters:
 *   • Five LISTING tables carry phones text[] / address text / hours text.
 *   • Beaches, snorkel spots, kayak spots and trails are natural features
 *     with no phone and no street address. They get the nearest useful
 *     equivalent instead (access notes, entry notes, gate hours), so their
 *     PDF entries are still worth reading rather than blank.
 *
 * `ref` is always the primary key. parsePlaceId() produced it from the
 * namespaced place_id, so it is trusted to be the id and nothing else.
 */
export const RESOLVE = {
  restaurant: { table: 'restaurant_listings', columns: 'id, name, address, phones, hours' },
  stay:       { table: 'stay_listings',       columns: 'id, name, address, phones, hours' },
  activity:   { table: 'activity_listings',   columns: 'id, name, address, phones, hours' },
  service:    { table: 'service_listings',    columns: 'id, name, address, phones, hours' },
  transport:  { table: 'transport_listings',  columns: 'id, name, address, phones, hours' },
  essential:  { table: 'essential_listings',  columns: 'id, name, address, phones, hours' },
  // No phone/address columns exist on these — do not add them to the SELECT,
  // it will throw 42703 undefined_column.
  beach:      { table: 'beaches',      columns: 'id, name, access AS address, gate_hours AS hours' },
  snorkel:    { table: 'snorkel_spots', columns: 'id, name, entry_notes AS address' },
  kayak:      { table: 'kayak_spots',   columns: 'id, name, entry_notes AS address' },
  trail:      { table: 'trails',        columns: 'id, name, gate_hours AS hours' },
}

/**
 * Batch-load contact detail for a trip's items — ONE query per distinct kind.
 *
 * Returns a Map keyed by placeId. A kind with no RESOLVE entry, a query that
 * throws, or a row that no longer exists all resolve to absent, and the
 * caller falls back to the snapshot. A place deleted from its listing table
 * since it was added MUST NOT fail the export.
 */
export async function resolveItems(pool, items) {
  const byKind = new Map()
  for (const it of items) {
    if (!RESOLVE[it.placeKind]) continue
    if (!byKind.has(it.placeKind)) byKind.set(it.placeKind, [])
    byKind.get(it.placeKind).push(it)
  }

  const out = new Map()
  for (const [kind, group] of byKind) {
    const { table, columns } = RESOLVE[kind]
    try {
      const { rows } = await pool.query(
        `SELECT ${columns} FROM public.${table} WHERE id::text = ANY($1)`,
        [group.map((g) => g.placeRef)],
      )
      const byId = new Map(rows.map((r) => [String(r.id), r]))
      for (const g of group) {
        const row = byId.get(String(g.placeRef))
        if (row) out.set(g.placeId, row)
      }
    } catch {
      // Whole-kind failure degrades to snapshot-only for that kind rather
      // than 500-ing an export the user has paid for.
    }
  }
  return out
}

/** A filename that survives every filesystem. Always ends in .pdf. */
export function tripFilename(title) {
  const slug = String(title || 'trip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'trip'}.pdf`
}

/** First phone from a text[] column, or ''. */
function firstPhone(row) {
  return Array.isArray(row?.phones) && row.phones.length ? String(row.phones[0]) : ''
}

/** Day count, mirroring tripDayCount() on the client. 0 for a dateless trip. */
function dayCount(trip) {
  if (!trip.startDate || !trip.endDate) return 0
  return Math.round(
    (Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86400000,
  ) + 1
}

/** 'Sat, Mar 7' for day i, or '' when the trip has no dates. */
function dayLabel(trip, i) {
  if (!trip.startDate) return ''
  const d = new Date(Date.parse(`${trip.startDate}T00:00:00Z`) + i * 86400000)
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function dateRange(trip) {
  if (!trip.startDate || !trip.endDate) return 'No dates set'
  const fmt = (s) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
  return `${fmt(trip.startDate)} – ${fmt(trip.endDate)}`
}
```

- [ ] **Step 3: Write the document builder**

Append to `backend/itineraryPdf.js`:

```js
/**
 * Draw the whole trip into an open PDFDocument.
 *
 * Bucketing MUST match TripDetailBody.tsx: an item whose dayIndex exceeds
 * the trip's CURRENT length falls into Unscheduled rather than vanishing,
 * because the trip was shortened after the place was added and deleting the
 * user's work to satisfy a date change is the wrong trade. If these two
 * disagree, the PDF and the screen show different itineraries.
 */
export function buildTripPdf(doc, trip, resolved) {
  const INK = '#0f172a'
  const MUTED = '#64748b'
  const RULE = '#e2e8f0'

  // --- Cover block ---
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(trip.title, { lineGap: 2 })
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(11).fillColor(MUTED)
     .text(`${dateRange(trip)}  ·  ${trip.items.length} place${trip.items.length === 1 ? '' : 's'}`)
  doc.moveDown(0.4)
  doc.strokeColor(RULE).lineWidth(1)
     .moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke()
  doc.moveDown(0.8)

  // --- Buckets, mirroring TripDetailBody ---
  const days = dayCount(trip)
  const buckets = []
  for (let i = 0; i < days; i++) {
    buckets.push({ label: `Day ${i + 1}`, sub: dayLabel(trip, i), items: [] })
  }
  const unscheduled = { label: 'Unscheduled', sub: '', items: [] }
  for (const it of trip.items) {
    const i = it.dayIndex
    if (i === null || i === undefined || i >= days) unscheduled.items.push(it)
    else buckets[i].items.push(it)
  }
  if (unscheduled.items.length > 0 || days === 0) buckets.push(unscheduled)

  for (const b of buckets) {
    // Start a new page when a heading would land in the last inch.
    if (doc.y > doc.page.height - doc.page.margins.bottom - 72) doc.addPage()

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(b.label, { continued: !!b.sub })
    if (b.sub) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`   ${b.sub}`)
    doc.moveDown(0.4)

    if (b.items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('Nothing planned')
      doc.moveDown(0.8)
      continue
    }

    for (const it of b.items) {
      const snap = it.snapshot || {}
      const live = resolved.get(it.placeId) || {}
      const name = live.name || snap.name || 'Saved place'
      const emoji = snap.icon?.emoji || ''
      const address = live.address || ''
      const phone = firstPhone(live)
      const hours = live.hours || ''

      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage()

      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5)
         .text(`${emoji ? emoji + '  ' : ''}${name}`)

      if (snap.subtitle) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(snap.subtitle)
      }
      for (const [label, value] of [['Address', address], ['Phone', phone], ['Hours', hours]]) {
        if (value) {
          doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`${label}: ${value}`)
        }
      }
      if (typeof snap.latitude === 'number' && typeof snap.longitude === 'number') {
        const url = `https://www.google.com/maps/search/?api=1&query=${snap.latitude},${snap.longitude}`
        doc.font('Helvetica').fontSize(9).fillColor('#0369a1')
           .text('Open in Google Maps', { link: url, underline: true })
      }
      doc.moveDown(0.7)
    }
    doc.moveDown(0.3)
  }

  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
     .text('Generated by Vieques AI · explorevieques.org', doc.page.margins.left,
           doc.page.height - doc.page.margins.bottom - 12, { align: 'center' })
}
```

- [ ] **Step 4: Verify the module parses and the map is complete**

```bash
cd backend && node --input-type=module -e "
import { RESOLVE, tripFilename } from './itineraryPdf.js'
const KINDS = ['beach','restaurant','stay','activity','service','transport','essential','snorkel','kayak','trail']
const missing = KINDS.filter(k => !RESOLVE[k])
console.log('missing kinds:', missing.length ? missing : 'none')
console.log(tripFilename('My Trip: Vieques 2026!'))
console.log(tripFilename(''))
"
```

Expected exactly:
```
missing kinds: none
my-trip-vieques-2026.pdf
trip.pdf
```

- [ ] **Step 5: Verify every resolve query is valid SQL against the real schema**

This catches a wrong column name now rather than at export time.

```bash
cd backend && node --input-type=module -e "
import './env.js'
import pg from 'pg'
import { RESOLVE } from './itineraryPdf.js'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, options: '-c search_path=public,extensions' })
for (const [kind, { table, columns }] of Object.entries(RESOLVE)) {
  try {
    await pool.query(\`SELECT \${columns} FROM public.\${table} WHERE id::text = ANY(\$1)\`, [[]])
    console.log('ok  ', kind, '->', table)
  } catch (e) { console.log('FAIL', kind, '->', table, e.message) }
}
await pool.end()
"
```

Expected: ten `ok` lines, no `FAIL`. A `FAIL` means that table's column list is
wrong — fix `RESOLVE` before continuing.

- [ ] **Step 6: Commit**

```bash
git add backend/itineraryPdf.js backend/package.json backend/package-lock.json
git commit -m "PDF document builder: kind-batched contact resolve, day sections"
```

---

## Task 3: PDF export route

**Files:**
- Modify: `backend/itineraries.js`

**Interfaces:**
- Consumes: `buildTripPdf`, `resolveItems`, `tripFilename` from Task 2; the existing `loadDetail(id, userId)` inside `mountItineraries`
- Produces: `GET /api/itineraries/:id/export.pdf`

- [ ] **Step 1: Add the imports**

At the top of `backend/itineraries.js`, after the existing imports:

```js
import PDFDocument from 'pdfkit'
import { buildTripPdf, resolveItems, tripFilename } from './itineraryPdf.js'
```

- [ ] **Step 2: Add the route**

Inside `mountItineraries`, after the DETAIL route and before the items route:

```js
  // ---- EXPORT ---------------------------------------------------------
  //  The Exploration tier's export. Gated on 'itinerary_export' rather than
  //  'itinerary': the two slugs are separate rungs in payments.js and a
  //  future tier could hold one without the other.
  //
  //  A lower rate limit than the mutating routes (10 vs 60): this is the
  //  most expensive call in the file — loadDetail, up to ten resolve
  //  queries, then document generation — and nobody exports the same trip
  //  sixty times a minute.
  //
  //  Streams to res. Headers go out BEFORE any drawing, because once the
  //  first chunk is written the status can no longer be changed — see the
  //  catch below.
  app.get('/api/itineraries/:id/export.pdf',
    requireAuth, requireTier(pool, 'itinerary_export'), rateLimit({ max: 10 }),
    async (req, res) => {
      try {
        const trip = await loadDetail(req.params.id, req.user.id)
        if (!trip) return res.status(404).json({ error: 'Trip not found.' })

        const resolved = await resolveItems(pool, trip.items)

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${tripFilename(trip.title)}"`,
        )

        const doc = new PDFDocument({ size: 'LETTER', margin: 54 })
        doc.pipe(res)
        buildTripPdf(doc, trip, resolved)
        doc.end()
      } catch (e) {
        // If drawing threw after piping started, the response is already
        // committed and a JSON error would corrupt the PDF stream. All that
        // is left is to destroy the socket so the client sees a failed
        // download rather than a truncated file it thinks is valid.
        if (res.headersSent) {
          console.error('[itineraries:export] after headers', e)
          return res.destroy()
        }
        fail(res, 'itineraries:export', e)
      }
    })
```

- [ ] **Step 3: Verify the server boots**

```bash
cd backend && node --check itineraries.js && npm start
```

Expected: `node --check` prints nothing, and the server logs its listening
line with no import errors. Leave it running for the next step.

- [ ] **Step 4: Verify the gate, ownership, and output**

Get a JWT for an **Exploration** user and a trip id belonging to them, then:

```bash
# 1. Exploration user, own trip -> a real PDF.
curl -s -D /tmp/h.txt -o /tmp/trip.pdf \
  -H "Authorization: Bearer $EXPLORATION_JWT" \
  http://localhost:3001/api/itineraries/$TRIP_ID/export.pdf
grep -i "content-type\|content-disposition" /tmp/h.txt
file /tmp/trip.pdf && head -c 5 /tmp/trip.pdf

# 2. A trip that is not theirs -> 404, not 500.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $EXPLORATION_JWT" \
  http://localhost:3001/api/itineraries/00000000-0000-0000-0000-000000000000/export.pdf

# 3. A Vacation-tier user -> 402 UPGRADE_REQUIRED.
curl -s -w '\n%{http_code}\n' \
  -H "Authorization: Bearer $VACATION_JWT" \
  http://localhost:3001/api/itineraries/$TRIP_ID/export.pdf
```

Expected:
1. `content-type: application/pdf`, `content-disposition: attachment; filename="..."`, `file` reports `PDF document`, and the first bytes are `%PDF-`.
2. `404`
3. A JSON body containing `"code":"UPGRADE_REQUIRED"` and status `402`.

- [ ] **Step 5: Verify a deleted listing does not break the export**

The snapshot fallback is the point of this test.

```bash
# Add a place to the trip with a ref that cannot exist, then export.
curl -s -X PUT -H "Authorization: Bearer $EXPLORATION_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"action":"add","placeId":"restaurant:99999999","dayIndex":0,
       "snapshot":{"name":"Ghost Cafe","subtitle":"deleted listing","latitude":18.1,"longitude":-65.4}}' \
  http://localhost:3001/api/itineraries/$TRIP_ID/items > /dev/null

curl -s -o /tmp/ghost.pdf -w '%{http_code}\n' \
  -H "Authorization: Bearer $EXPLORATION_JWT" \
  http://localhost:3001/api/itineraries/$TRIP_ID/export.pdf
```

Expected: `200`, and opening `/tmp/ghost.pdf` shows a **Ghost Cafe** entry
carrying its snapshot subtitle. Remove the test item afterwards with
`{"action":"remove","placeId":"restaurant:99999999"}`.

- [ ] **Step 6: Commit**

```bash
git add backend/itineraries.js
git commit -m "Export route: GET /api/itineraries/:id/export.pdf, Exploration-gated"
```

---

## Task 4: Export button in the trip detail UI

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/TripDetailBody.tsx`

**Interfaces:**
- Consumes: `GET /api/itineraries/:id/export.pdf` from Task 3; the existing `apiFetch`, `raise` and `ApiError` in `api.ts`
- Produces: `downloadTripPdf(tripId: string, title: string): Promise<void>`

- [ ] **Step 1: Add the download helper to api.ts**

Add near the other itinerary helpers in `frontend/src/lib/api.ts`:

```ts
/**
 * Fetch a trip's PDF and hand it to the browser as a download.
 *
 * Not a plain <a href> or window.open: the route needs an Authorization
 * header, and neither of those can send one. So the bytes come back through
 * apiFetch and are handed over as an object URL instead.
 */
export async function downloadTripPdf(tripId: string, title: string): Promise<void> {
  const res = await apiFetch(`/api/itineraries/${tripId}/export.pdf`)
  if (!res.ok) await raise(res, 'Export failed')

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'trip').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick — Safari cancels the download if the URL is
  // released synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

- [ ] **Step 2: Wire the button into TripDetailBody**

In `frontend/src/components/TripDetailBody.tsx`:

Add to the lucide import on line 2 — `Download` and `Loader2`:

```tsx
import { CalendarDays, ChevronLeft, Download, Loader2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
```

Add to the api import:

```tsx
import {
  downloadTripPdf, formatDateRange, tripDayCount, tripDayDate,
  type TripDetail, type TripItem,
} from '../lib/api'
```

Add the feature hook import:

```tsx
import { useFeature } from '../lib/entitlement'
```

Inside the component, after the `menuFor` state:

```tsx
  const canExport = useFeature('itinerary_export')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await downloadTripPdf(trip.id, trip.title)
    } catch {
      setExportError('Could not build the PDF. Try again.')
    } finally {
      setExporting(false)
    }
  }
```

Then in the header, immediately before the existing edit button:

```tsx
        {canExport && (
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-label="Export trip as PDF"
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground disabled:opacity-40"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          </button>
        )}
```

And directly after the header `</div>`, so a failure is visible rather than silent:

```tsx
      {exportError && (
        <div className="mx-4 mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          {exportError}
        </div>
      )}
```

The button is **hidden below Exploration, not disabled** — `TripsBody`
already renders `UpsellOverlay` for locked users, so a second upsell here
would be redundant.

- [ ] **Step 3: Verify it typechecks**

```bash
cd frontend && npx tsc -b
```

Expected: no output (success).

- [ ] **Step 4: Verify in the browser**

```bash
cd frontend && npm run dev
```

Sign in as an **Exploration** user, open Saved → Trips → a trip with places
on at least two days.

Check all of:
- A download icon sits left of the pencil in the header
- Clicking it spins briefly, then a `.pdf` lands in Downloads
- Opening the PDF shows the title, date range, day sections in order, and addresses/phones for restaurants
- Sign in as a **Vacation** user: the download icon is absent

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/TripDetailBody.tsx
git commit -m "Export button in trip detail, Exploration only"
```

---

## Task 5: Conversation persistence and routes

**Files:**
- Create: `backend/aiConversations.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireTier`, `rateLimit` from `./middleware.js`; `tierHas`, `bestTier` from `./payments.js`; `fail` from `./httpError.js`
- Produces:
  - `mountAiConversations(app, pool)` — mounts the four routes
  - `persistTurn(pool, { userId, tier, conversationId, userText, replyText, pins }) -> Promise<string|null>` — returns the conversation id, or `null` when nothing was saved

- [ ] **Step 1: Write the module**

Create `backend/aiConversations.js`:

```js
/**
 * Saved Ask AI conversations — the 'ai_history' feature (Vacation and up).
 *
 * Ownership is proven by `user_id = $userId` in the WHERE clause of every
 * statement, exactly as itineraries.js does. RLS also covers these tables,
 * but these routes connect as the table owner and bypass it — the predicate
 * in the SQL is the actual enforcement.
 */
import { requireAuth, requireTier, rateLimit } from './middleware.js'
import { tierHas } from './payments.js'
import { fail } from './httpError.js'

const MAX_TITLE = 80

function toConversation(row) {
  return {
    id: row.id,
    title: row.title,
    messageCount: Number(row.message_count ?? 0),
    updatedAt: row.updated_at,
  }
}

function toMessage(row) {
  return {
    role: row.role,
    content: row.content,
    pins: Array.isArray(row.pins) ? row.pins : [],
  }
}

/**
 * A conversation title from the user's first message.
 *
 * A truncation, not a second model call: no hidden inference cost, and in
 * this domain the question the user actually asked ("Where can I get
 * seafood?") is a better list entry than a summary of it. Collapses
 * whitespace so a pasted multi-line question doesn't break the row layout.
 */
export function titleFrom(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return 'New conversation'
  return flat.length <= MAX_TITLE ? flat : `${flat.slice(0, MAX_TITLE - 1)}…`
}

/**
 * Write one completed turn (the question and its answer) to history.
 *
 * Called from /api/ai/chat AFTER the model has answered and the credit has
 * already been spent. Three rules follow from that ordering:
 *
 *   1. NEVER THROW. The caller must still return the reply the user paid
 *      for. Every failure is swallowed and logged; the worst outcome is an
 *      unsaved transcript, which beats a lost answer.
 *   2. A conversationId that is not this user's is treated as absent — a
 *      new conversation is started rather than erroring, for the same
 *      reason.
 *   3. Free tier saves nothing. Persistence is gated on 'ai_history', while
 *      the chat itself is gated only on credits, so the free tier keeps its
 *      3 lifetime messages and simply gets no history.
 *
 * @returns {Promise<string|null>} the conversation id, or null if unsaved.
 */
export async function persistTurn(pool, { userId, tier, conversationId, userText, replyText, pins }) {
  if (!tierHas(tier, 'ai_history')) return null

  try {
    let id = null

    if (conversationId) {
      const { rows } = await pool.query(
        `SELECT id FROM public.ai_conversations WHERE id = $1 AND user_id = $2`,
        [conversationId, userId],
      )
      if (rows[0]) id = rows[0].id
    }

    if (!id) {
      const { rows } = await pool.query(
        `INSERT INTO public.ai_conversations (user_id, title)
         VALUES ($1, $2) RETURNING id`,
        [userId, titleFrom(userText)],
      )
      id = rows[0].id
    }

    // Both messages of the turn in one statement, so a transcript can never
    // hold a question without its answer. seq continues from the current
    // tail; the UNIQUE (conversation_id, seq) constraint makes a concurrent
    // double-send fail loudly here rather than silently reorder the
    // transcript.
    await pool.query(
      `INSERT INTO public.ai_messages (conversation_id, role, content, pins, seq)
       SELECT $1, v.role, v.content, v.pins::jsonb,
              COALESCE((SELECT max(seq) + 1 FROM public.ai_messages WHERE conversation_id = $1), 0)
                + v.offset
         FROM (VALUES ('user', $2::text, '[]', 0),
                      ('assistant', $3::text, $4::text, 1))
              AS v(role, content, pins, offset)`,
      [id, userText, replyText, JSON.stringify(Array.isArray(pins) ? pins : [])],
    )

    await pool.query(
      `UPDATE public.ai_conversations SET updated_at = now() WHERE id = $1`,
      [id],
    )
    return id
  } catch (e) {
    // Deliberately swallowed — see rule 1 above.
    console.error('[ai:persistTurn]', e)
    return null
  }
}

export function mountAiConversations(app, pool) {
  const gate = [requireAuth, requireTier(pool, 'ai_history')]
  const mutate = [...gate, rateLimit({ max: 60 })]

  // ---- LIST -----------------------------------------------------------
  // No messages: the list renders a title and a count, and shipping every
  // transcript for every conversation would be the largest response in the
  // app for the least-read data. Same reasoning as the itineraries LIST.
  app.get('/api/ai/conversations', ...gate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.*, (SELECT count(*) FROM public.ai_messages m
                       WHERE m.conversation_id = c.id) AS message_count
           FROM public.ai_conversations c
          WHERE c.user_id = $1
          ORDER BY c.updated_at DESC
          LIMIT 100`,
        [req.user.id],
      )
      res.json(rows.map(toConversation))
    } catch (e) {
      fail(res, 'ai:conversations:list', e)
    }
  })

  // ---- DETAIL ---------------------------------------------------------
  app.get('/api/ai/conversations/:id', ...gate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, title, updated_at FROM public.ai_conversations
          WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!rows[0]) return res.status(404).json({ error: 'Conversation not found.' })

      const msgs = await pool.query(
        `SELECT role, content, pins FROM public.ai_messages
          WHERE conversation_id = $1 ORDER BY seq`,
        [req.params.id],
      )
      res.json({
        id: rows[0].id,
        title: rows[0].title,
        updatedAt: rows[0].updated_at,
        messages: msgs.rows.map(toMessage),
      })
    } catch (e) {
      fail(res, 'ai:conversations:detail', e)
    }
  })

  // ---- RENAME ---------------------------------------------------------
  // Validated here as well as by the CHECK constraint: a 23514 surfaces to
  // the user as a generic 500, while this produces a sentence the UI can
  // render. Same reasoning as validateTrip() in itineraries.js.
  app.patch('/api/ai/conversations/:id', ...mutate, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title) return res.status(400).json({ error: 'Name the conversation.' })
    if (title.length > MAX_TITLE) {
      return res.status(400).json({ error: `Keep the name under ${MAX_TITLE} characters.` })
    }
    try {
      const { rows } = await pool.query(
        `UPDATE public.ai_conversations SET title = $3, updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING *, (SELECT count(*) FROM public.ai_messages m
                         WHERE m.conversation_id = id) AS message_count`,
        [req.params.id, req.user.id, title],
      )
      if (!rows[0]) return res.status(404).json({ error: 'Conversation not found.' })
      res.json(toConversation(rows[0]))
    } catch (e) {
      fail(res, 'ai:conversations:rename', e)
    }
  })

  // ---- DELETE ---------------------------------------------------------
  // Messages go with it via ON DELETE CASCADE (0046).
  app.delete('/api/ai/conversations/:id', ...mutate, async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM public.ai_conversations WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!rowCount) return res.status(404).json({ error: 'Conversation not found.' })
      res.status(204).end()
    } catch (e) {
      fail(res, 'ai:conversations:delete', e)
    }
  })
}
```

- [ ] **Step 2: Mount the router and persist from /api/ai/chat**

In `backend/server.js`:

Add to the imports beside the `mountItineraries` import:

```js
import { mountAiConversations, persistTurn } from './aiConversations.js'
```

Find the existing `mountItineraries(app, pool)` call and add below it:

```js
mountAiConversations(app, pool)
```

Then in the `/api/ai/chat` handler, replace the `res.json({ ... })` block
(the one sending `reply`, `pins`, `creditsRemaining`) with:

```js
    // History is written AFTER the answer exists and the credit is spent.
    // persistTurn never throws — an unsaved transcript must not cost the
    // user the reply they paid for. Returns null for the free tier, which
    // has Ask AI but not 'ai_history'.
    //
    // req.tier is not set on this route (requireCredits gates it, not
    // requireTier), so the tier is read here.
    const { rows: subs } = await pool.query(
      `SELECT plan FROM public.subscriptions
        WHERE user_id = $1 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())`,
      [req.user.id],
    ).catch(() => ({ rows: [] }))

    const conversationId = await persistTurn(pool, {
      userId: req.user.id,
      tier: bestTier(subs),
      conversationId: req.body?.conversationId,
      userText: userMessages[userMessages.length - 1]?.content ?? '',
      replyText: reply || 'Sorry, I could not find an answer.',
      pins,
    })

    res.json({
      reply: reply || 'Sorry, I could not find an answer.',
      pins,
      // Lets the chat pane show "12 messages left" without a second round trip.
      creditsRemaining: Number(bal[0]?.balance ?? 0),
      // null for tiers without 'ai_history' — the client then stays ephemeral.
      conversationId,
    })
```

Add `bestTier` to the existing `payments.js` import in `server.js`:

```js
import { createCheckoutSession, handleWebhook, getEntitlement, getCreditHistory, tierHas, bestTier } from './payments.js'
```

- [ ] **Step 3: Verify both files parse and the server boots**

```bash
cd backend && node --check aiConversations.js && node --check server.js && npm start
```

Expected: no output from either check, and the server logs its listening
line. Leave it running.

- [ ] **Step 4: Verify persistence, the free-tier skip, and cross-user isolation**

With a **Vacation** JWT and a **free-tier** JWT:

```bash
# 1. First message creates a conversation and returns its id.
curl -s -X POST -H "Authorization: Bearer $VACATION_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Where can I get seafood?"}]}' \
  http://localhost:3001/api/ai/chat | python3 -m json.tool | grep -E 'conversationId|creditsRemaining'

# 2. The list shows it, with a message count of 2.
curl -s -H "Authorization: Bearer $VACATION_JWT" \
  http://localhost:3001/api/ai/conversations | python3 -m json.tool

# 3. A second message with that id APPENDS rather than creating a second row.
curl -s -X POST -H "Authorization: Bearer $VACATION_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"'$CONV_ID'","messages":[
        {"role":"user","content":"Where can I get seafood?"},
        {"role":"assistant","content":"Try El Resuelve."},
        {"role":"user","content":"Which is open Monday?"}]}' \
  http://localhost:3001/api/ai/chat | python3 -m json.tool | grep conversationId

# 4. Free tier persists nothing.
curl -s -X POST -H "Authorization: Bearer $FREE_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hello"}]}' \
  http://localhost:3001/api/ai/chat | python3 -m json.tool | grep conversationId

curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $FREE_JWT" \
  http://localhost:3001/api/ai/conversations

# 5. Another user's conversation id starts a FRESH one, it does not write into theirs.
curl -s -X POST -H "Authorization: Bearer $OTHER_VACATION_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"'$CONV_ID'","messages":[{"role":"user","content":"intrusion"}]}' \
  http://localhost:3001/api/ai/chat | python3 -m json.tool | grep conversationId
```

Expected:
1. A uuid `conversationId`.
2. One conversation, `"messageCount": 2`, titled `Where can I get seafood?`.
3. The **same** id as step 1 — and re-running the list shows `"messageCount": 4`, still one conversation.
4. `"conversationId": null`, and the list returns `402`.
5. A **different** uuid from `$CONV_ID`. Confirm `$CONV_ID` still has 4 messages, not 6.

- [ ] **Step 5: Verify rename and delete**

```bash
# Rename.
curl -s -X PATCH -H "Authorization: Bearer $VACATION_JWT" \
  -H 'Content-Type: application/json' -d '{"title":"Seafood plans"}' \
  http://localhost:3001/api/ai/conversations/$CONV_ID | python3 -m json.tool

# Empty title is rejected with a sentence, not a 500.
curl -s -w '\n%{http_code}\n' -X PATCH -H "Authorization: Bearer $VACATION_JWT" \
  -H 'Content-Type: application/json' -d '{"title":"   "}' \
  http://localhost:3001/api/ai/conversations/$CONV_ID

# A conversation that isn't theirs 404s rather than 204ing silently.
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $VACATION_JWT" \
  http://localhost:3001/api/ai/conversations/00000000-0000-0000-0000-000000000000

# Delete, then confirm the messages cascaded.
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "Authorization: Bearer $VACATION_JWT" \
  http://localhost:3001/api/ai/conversations/$CONV_ID
psql "$DATABASE_URL" -tAc \
  "SELECT count(*) FROM public.ai_messages WHERE conversation_id = '$CONV_ID'"
```

Expected: rename returns the updated row; the empty title returns
`{"error":"Name the conversation."}` with `400`; the missing id returns
`404`; the real delete returns `204`; the final count is `0`.

- [ ] **Step 6: Commit**

```bash
git add backend/aiConversations.js backend/server.js
git commit -m "Chat history: persist turns in /api/ai/chat, four conversation routes"
```

---

## Task 6: Conversation state on the client

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/aiChat.tsx`

**Interfaces:**
- Consumes: the routes from Task 5
- Produces:
  - `type ConversationSummary = { id: string; title: string; messageCount: number; updatedAt: string }`
  - `type ConversationDetail = { id: string; title: string; updatedAt: string; messages: SavedMessage[] }`
  - `type SavedMessage = { role: 'user' | 'assistant'; content: string; pins: AiPin[] }`
  - `fetchConversations()`, `fetchConversation(id)`, `renameConversation(id, title)`, `deleteConversation(id)`
  - `sendAiChat(messages, conversationId?)` — **signature change**, second arg optional
  - `AiChatState` gains: `conversationId`, `conversations`, `historyLoading`, `canSaveHistory`, `newChat()`, `openConversation(id)`, `renameConversation(id, title)`, `deleteConversation(id)`

- [ ] **Step 1: Add the API types and fetchers**

In `frontend/src/lib/api.ts`, replace the existing `sendAiChat` with the
version below and add the conversation helpers after it:

```ts
export async function sendAiChat(
  messages: AiChatMessage[],
  conversationId?: string | null,
): Promise<{ reply: string; pins: AiPin[]; creditsRemaining: number; conversationId: string | null }> {
  const res = await apiFetch(`/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, conversationId: conversationId ?? undefined }),
  })
  // A 402 here means the allowance is spent. Thrown as an ApiError with
  // code 'NO_CREDITS' so AiChatPane can offer an upgrade rather than printing
  // the raw server message.
  if (!res.ok) await raise(res, 'AI chat failed')
  return res.json()
}

// ---------------------------------------------------------------------------
//  Saved conversations — the 'ai_history' feature (Vacation and up)
// ---------------------------------------------------------------------------

export type ConversationSummary = {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

export type SavedMessage = { role: 'user' | 'assistant'; content: string; pins: AiPin[] }

export type ConversationDetail = {
  id: string
  title: string
  updatedAt: string
  messages: SavedMessage[]
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await apiFetch('/api/ai/conversations')
  if (!res.ok) await raise(res, 'Could not load conversations')
  return res.json()
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  const res = await apiFetch(`/api/ai/conversations/${id}`)
  if (!res.ok) await raise(res, 'Could not load conversation')
  return res.json()
}

export async function renameConversation(
  id: string, title: string,
): Promise<ConversationSummary> {
  const res = await apiFetch(`/api/ai/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) await raise(res, 'Rename failed')
  return res.json()
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await apiFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' })
  if (!res.ok) await raise(res, 'Delete failed')
}
```

- [ ] **Step 2: Extend the AiChatState type**

In `frontend/src/lib/aiChat.tsx`, update the imports:

```tsx
import {
  sendAiChat, fetchConversations, fetchConversation,
  renameConversation as apiRename, deleteConversation as apiDelete,
  ApiError, type AiChatMessage, type AiPin, type ConversationSummary,
} from './api'
import { useEntitlement, useFeature } from './entitlement'
```

Add to the `AiChatState` type, after `pinsSeq`:

```tsx
  /** The open conversation, or null for an unsaved one that has no turns yet. */
  conversationId: string | null
  /** This user's saved conversations, newest first. Empty below Vacation. */
  conversations: ConversationSummary[]
  /** True while the list or a transcript is loading. */
  historyLoading: boolean
  /** Does this plan include 'ai_history'? Hides the history UI when false. */
  canSaveHistory: boolean
  /** Clear the transcript. Creates nothing until the next send. */
  newChat: () => void
  /** Load a saved transcript and replay its pins onto the map. */
  openConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
```

- [ ] **Step 3: Implement the state in the provider**

In `AiChatProvider`, add after the existing `pinsSeq` state:

```tsx
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const canSaveHistory = useFeature('ai_history')

  // The list is small (title + count, capped at 100 server-side) and is what
  // the history view renders, so it is fetched once on mount rather than on
  // every open. Below Vacation the route 402s, so don't ask.
  const refreshConversations = useCallback(async () => {
    if (!canSaveHistory) return
    try {
      setConversations(await fetchConversations())
    } catch {
      // A failed list leaves the previous one on screen — better than an
      // empty history that looks like data loss.
    }
  }, [canSaveHistory])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  const newChat = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setError(null)
    setInput('')
  }, [])

  const openConversation = useCallback(async (id: string) => {
    setHistoryLoading(true)
    setError(null)
    try {
      const detail = await fetchConversation(id)
      setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })))
      setConversationId(detail.id)
      // Replay every pin the conversation produced, de-duplicated by id: two
      // answers naming the same restaurant must not stack two markers.
      const seen = new Set<string>()
      const pins: AiPin[] = []
      for (const m of detail.messages) {
        for (const p of m.pins ?? []) {
          if (!seen.has(p.id)) { seen.add(p.id); pins.push(p) }
        }
      }
      if (pins.length) {
        onPins(pins)
        setPinsSeq((n) => n + 1)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setHistoryLoading(false)
    }
  }, [onPins])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const updated = await apiRename(id, title)
    setConversations((cs) => cs.map((c) => (c.id === id ? updated : c)))
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    await apiDelete(id)
    setConversations((cs) => cs.filter((c) => c.id !== id))
    // Deleting the conversation you are reading leaves the transcript
    // orphaned — the next send would try to append to a row that no longer
    // exists. Reset to a fresh chat instead.
    setConversationId((cur) => {
      if (cur !== id) return cur
      setMessages([])
      return null
    })
  }, [])
```

- [ ] **Step 4: Thread the conversation id through send()**

Replace the body of `send()`'s try block and its dependency array:

```tsx
    try {
      const { reply, pins, creditsRemaining, conversationId: newId } =
        await sendAiChat(next, conversationId)
      setMessages([...next, { role: 'assistant', content: reply }])
      if (pins.length) {
        onPins(pins)
        setPinsSeq((n) => n + 1)
      }
      // The server creates the conversation on the first turn and returns
      // its id; null means this tier doesn't save history.
      if (newId && newId !== conversationId) {
        setConversationId(newId)
        void refreshConversations()
      } else if (newId) {
        // An append — the list's ordering and count changed.
        void refreshConversations()
      }
      // The server is authoritative on the balance — it just wrote the ledger row.
      setRemaining(creditsRemaining)
      if (creditsRemaining <= 0) setOutOfCredits(true)
      void refresh()
    } catch (e) {
```

and:

```tsx
  }, [input, loading, remaining, messages, onPins, refresh, conversationId, refreshConversations])
```

- [ ] **Step 5: Add the new fields to the context value**

Extend the `value={{ ... }}` object with:

```tsx
        conversationId,
        conversations,
        historyLoading,
        canSaveHistory,
        newChat,
        openConversation,
        renameConversation,
        deleteConversation,
```

- [ ] **Step 6: Verify it typechecks**

```bash
cd frontend && npx tsc -b
```

Expected: no output. A `sendAiChat` arity error here means Step 1 was not
applied — the second argument is optional, so existing callers still compile.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/aiChat.tsx
git commit -m "Client conversation state: list, open, rename, delete, pin replay"
```

---

## Task 7: History view and the two-screen panel

**Files:**
- Create: `frontend/src/components/AiChatHistoryBody.tsx`
- Modify: `frontend/src/components/AiChatBody.tsx`

**Interfaces:**
- Consumes: `useAiChat()` from Task 6
- Produces: `<AiChatHistoryBody onOpen={() => void} navPad={boolean} />` — the list; the caller pops back to the chat view via `onOpen`

- [ ] **Step 1: Write the history component**

Create `frontend/src/components/AiChatHistoryBody.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Check, MessageSquarePlus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'

import { useAiChat } from '../lib/aiChat'
import type { ConversationSummary } from '../lib/api'

type Props = {
  /** Called after opening a conversation or starting a new one, so the
   *  parent can pop back to the transcript. */
  onOpen: () => void
  /** Mobile: clear the bottom nav with the scroller's bottom padding. */
  navPad?: boolean
}

/**
 * The saved-conversations list.
 *
 * Split out of AiChatBody rather than inlined: that file is the transcript
 * plus the composer, and adding the list, the date grouping and a per-row
 * menu would push it past 280 lines of two unrelated concerns.
 *
 * Rendered on BOTH platforms — AiChatBody is the shared tree that desktop's
 * AiChatPane and the mobile map sheet both render, so this needs no separate
 * phone implementation.
 */
export default function AiChatHistoryBody({ onOpen, navPad = false }: Props) {
  const {
    conversations, historyLoading, conversationId,
    newChat, openConversation, renameConversation, deleteConversation,
  } = useAiChat()

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Grouped by recency the way every chat UI does it, so a long list stays
  // scannable. Compared on local calendar days, not elapsed hours: a message
  // from 11pm yesterday is "Yesterday", not "Today", 60 minutes later.
  const groups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000)

    const out: { label: string; items: ConversationSummary[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Earlier', items: [] },
    ]
    for (const c of conversations) {
      const t = new Date(c.updatedAt).getTime()
      if (t >= startOfToday.getTime()) out[0].items.push(c)
      else if (t >= startOfYesterday.getTime()) out[1].items.push(c)
      else out[2].items.push(c)
    }
    return out.filter((g) => g.items.length > 0)
  }, [conversations])

  function startRename(c: ConversationSummary) {
    setEditingId(c.id)
    setDraft(c.title)
    setMenuFor(null)
  }

  async function commitRename(id: string) {
    const title = draft.trim()
    setEditingId(null)
    if (!title) return
    try {
      await renameConversation(id, title)
    } catch {
      // The list still shows the old title, which is the truth on the server.
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-white/8 p-4">
        <button
          onClick={() => { newChat(); onOpen() }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15"
        >
          <MessageSquarePlus size={15} />
          New chat
        </button>
      </div>

      <div
        className={`scroll-contain scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 ${
          navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
        }`}
      >
        {conversations.length === 0 && !historyLoading && (
          <div className="px-2 py-10 text-center">
            <p className="text-sm text-foreground">No saved chats yet</p>
            <p className="mx-auto mt-1.5 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
              Ask a question and the conversation is saved here automatically.
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.label} className="mb-4 last:mb-0">
            <h3 className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {g.label}
            </h3>
            <div className="flex flex-col gap-1.5">
              {g.items.map((c) => (
                <div key={c.id} className="relative">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-1.5 rounded-2xl border border-primary/40 bg-white/4 py-1.5 pl-3 pr-1.5">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={80}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(c.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      />
                      <button
                        onClick={() => void commitRename(c.id)}
                        aria-label="Save name"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary hover:bg-white/8"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/8"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { void openConversation(c.id); onOpen() }}
                        className={`w-full rounded-2xl border px-3.5 py-2.5 pr-11 text-left transition-colors ${
                          c.id === conversationId
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-white/8 bg-white/3 hover:bg-white/6'
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
                          {' · '}
                          {new Date(c.updatedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                        </p>
                      </button>
                      <button
                        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                        aria-label={`Options for ${c.title}`}
                        aria-expanded={menuFor === c.id}
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </>
                  )}

                  {menuFor === c.id && (
                    <div className="mt-1 rounded-xl border border-white/10 bg-background/95 p-1.5 shadow-xl backdrop-blur">
                      <button
                        onClick={() => startRename(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-white/8"
                      >
                        <Pencil size={13} />
                        Rename
                      </button>
                      {confirmId === c.id ? (
                        <button
                          onClick={() => {
                            void deleteConversation(c.id)
                            setConfirmId(null)
                            setMenuFor(null)
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg bg-red-500/15 px-2.5 py-2 text-xs font-semibold text-red-300"
                        >
                          <Trash2 size={13} />
                          Tap again to delete
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(c.id)}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Add the view state and header toggle to AiChatBody**

In `frontend/src/components/AiChatBody.tsx`:

Update the imports:

```tsx
import { useEffect, useRef, useState } from 'react'
import { History, MessageSquare, Send, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { LANDING_URL } from '../lib/api'
import { useAiChat } from '../lib/aiChat'
import { useEntitlement } from '../lib/entitlement'
import AiChatHistoryBody from './AiChatHistoryBody'
```

Destructure the two new values and add the view state at the top of the
component:

```tsx
  const {
    messages, input, setInput, loading, error, outOfCredits, remaining, send,
    canSaveHistory, conversations,
  } = useAiChat()
  const { tier } = useEntitlement()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Chat is the primary surface; history is pushed over it and pops back.
  // The same master/detail relationship TripsBody has with TripDetailBody —
  // not SavedBody's segmented tabs, which would spend a row of height on a
  // view the user visits occasionally.
  const [view, setView] = useState<'chat' | 'history'>('chat')
```

Replace the header block (the `<div className="flex shrink-0 items-start
justify-between gap-3 border-b border-white/8 p-4">` element and its
contents) with:

```tsx
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 p-4">
        <div>
          <h2 className="font-display text-xl leading-none tracking-tight">
            {view === 'history' ? (
              'Conversations'
            ) : (
              <>Ask <span className="italic text-primary">Vieques</span></>
            )}
          </h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {view === 'history' ? (
              `${conversations.length} saved`
            ) : (
              <>
                {remaining > 0
                  ? `${remaining} message${remaining === 1 ? '' : 's'} left`
                  : 'No messages left'}
                {tier === 'free' && ' · free trial'}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canSaveHistory && (
            <button
              onClick={() => setView(view === 'history' ? 'chat' : 'history')}
              aria-label={view === 'history' ? 'Back to chat' : 'Saved conversations'}
              className={`grid h-8 w-8 place-items-center rounded-xl hover:bg-white/8 ${
                view === 'history'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {view === 'history' ? <MessageSquare size={15} /> : <History size={15} />}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
```

- [ ] **Step 3: Branch the body on the view**

Immediately after the header block, insert the history branch. The
transcript scroller and the composer become the `chat` branch:

```tsx
      {view === 'history' ? (
        <AiChatHistoryBody onOpen={() => setView('chat')} navPad={navPad} />
      ) : (
        <>
```

…then wrap the existing transcript `<div ref={scrollRef} …>` and the
composer `<div className={`shrink-0 border-t …`}>` inside that fragment, and
close it before the final `</>`:

```tsx
        </>
      )}
```

The composer must stay inside the `chat` branch — the history view has no
input, and on mobile a stray text input outside the drawer cannot be focused
at all (vaul's dialog traps focus; see the note in `AiChatPane`).

- [ ] **Step 4: Verify it typechecks**

```bash
cd frontend && npx tsc -b
```

Expected: no output. A JSX-nesting error means the fragment in Step 3 was
closed in the wrong place.

- [ ] **Step 5: Verify on desktop**

```bash
cd frontend && npm run dev
```

Sign in as a **Vacation** user on a wide window and open Ask AI:
- Send a message; the reply arrives as before
- The history icon appears in the header; clicking it shows the list with the conversation just created, titled from the question
- The ⋯ menu renames (Enter commits, Escape cancels) and deletes (two taps)
- "New chat" clears the transcript and returns to the chat view
- Reopening a conversation restores the transcript **and** its map pins
- Sign in as a **free-tier** user: no history icon, chat behaves exactly as before

- [ ] **Step 6: Verify on mobile**

In devtools, switch to an iPhone viewport (≤640px) and reload.

- Bottom nav → Ask AI opens the sheet with the chat
- The history icon works inside the sheet, and the list scrolls with the nav cleared at the bottom
- Opening a conversation collapses the sheet to reveal its pins on the map
- The composer is focusable and the keyboard does not cover it
- Switching to Explore and back preserves the open conversation

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AiChatHistoryBody.tsx frontend/src/components/AiChatBody.tsx
git commit -m "Two-screen chat panel: transcript and saved conversations"
```

---

## Task 8: Full-stack verification

No new code. This is the pass that catches integration breaks the per-task
checks cannot see, because it exercises both features against one running
stack.

**Files:** none

- [ ] **Step 1: Confirm the whole app builds**

```bash
cd frontend && npx tsc -b && npm run build
cd ../backend && node --check server.js && node --check aiConversations.js && node --check itineraries.js && node --check itineraryPdf.js
```

Expected: a clean Vite build with no TypeScript errors, and silence from
every `node --check`.

- [ ] **Step 2: Walk the Exploration path end to end**

With the backend and frontend running, signed in as **Exploration**:

1. Saved → Trips → create a trip with dates spanning 3 days
2. Add a restaurant to Day 1, a beach to Day 2, and one place with no day
3. Open the trip and export the PDF
4. Confirm the PDF has: the title, the date range, `Day 1` with the restaurant's **address and phone**, `Day 2` with the beach, `Day 3` reading "Nothing planned", and an `Unscheduled` section holding the last place
5. Ask AI → send two messages → history icon → the conversation is listed
6. Rename it, reload the page, confirm the new name persisted

- [ ] **Step 3: Confirm the tier boundaries hold**

| Tier | Ask AI | History icon | Trips | Export button |
|---|---|---|---|---|
| free | yes, 3 lifetime | **no** | upsell | **no** |
| day_trip | no credits | **no** | upsell | **no** |
| vacation | yes | **yes** | upsell | **no** |
| exploration | yes | **yes** | yes | **yes** |

Sign in as each and confirm the row. A `yes` in a `no` cell is a gating bug
and blocks the merge.

- [ ] **Step 4: Confirm nothing regressed**

- Favorites still save and appear under Saved → Places
- Map pins, filters and directions still work
- The credit counter still decrements per message and the out-of-credits
  upsell still renders at zero

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Fixes from full-stack verification"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GET /api/itineraries/:id/export.pdf`, Exploration-gated, rate-limited | 3 |
| pdfkit, streamed | 2, 3 |
| Batched resolve, one query per kind | 2 |
| Snapshot fallback for deleted listings | 2 (code), 3 (verify) |
| Cover block, day sections, Unscheduled last, Maps links | 2 |
| Download button, hidden below Exploration | 4 |
| `ai_conversations` + `ai_messages`, RLS, indexes, `seq`, `pins` | 1 |
| Persist inside `/api/ai/chat`, optional `conversationId` | 5 |
| Title from truncated first message | 5 (`titleFrom`) |
| Foreign `conversationId` starts fresh | 5 (verify step 4.5) |
| Persistence failure never fails the request | 5 (`persistTurn` catch) |
| Free tier ephemeral | 5 (`tierHas` guard), 8 (matrix) |
| Four conversation routes | 5 |
| Client state, pin replay | 6 |
| Two-screen panel, header toggle | 7 |
| Rename/delete on both platforms | 7 |
| Split into `AiChatHistoryBody` | 7 |

No gaps.

**Type consistency:** `ConversationSummary` (Task 6) is what
`AiChatHistoryBody` imports (Task 7). `persistTurn`'s return (Task 5) feeds
`conversationId` in the `sendAiChat` response type (Task 6). `AiPin` is
reused unchanged from `api.ts` for the `pins` column. `buildTripPdf(doc,
trip, resolved)` and `resolveItems(pool, items) -> Map` (Task 2) are called
with those exact signatures in Task 3.

**One risk worth naming:** Task 7 Step 3 is the only step that edits JSX by
description rather than by full replacement, because the block being wrapped
is 90 lines that are otherwise unchanged. If the fragment nesting fights
back, replace the whole `return (…)` rather than patching around it.
