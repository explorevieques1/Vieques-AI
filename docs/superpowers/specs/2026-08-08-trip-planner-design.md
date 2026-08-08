# Trip Planner (Itinerary Builder) — Design

**Status:** approved design, ready for implementation planning.
**Date:** 2026-08-08
**Feature slug:** `itinerary` (Exploration tier)

---

## 0. Why this exists

The Exploration tier ($24.99) is sold on four differentiators over Vacation
($13.99): more AI messages, a multi-day itinerary builder, itinerary export, and
priority support. An audit on 2026-08-08 found only the message count is real.
`offline_maps` was removed outright the same day rather than built.

This feature builds the itinerary builder — the largest of the remaining
promises and the one the tier's price actually rests on. The `itinerary` slug
has existed in [backend/payments.js](../../../backend/payments.js) since the
pricing tiers landed, gating nothing. The Anthropic client at
[backend/server.js:61](../../../backend/server.js#L61) is reserved for it and
carries a `do not delete` comment. The hamburger menu item exists and fires a
"coming soon" toast.

Export (`itinerary_export`) is explicitly **not** in this scope. It will be
built once the planner is functioning.

---

## 1. Scope

### In

- Create, rename, delete named trips with an optional date range
- Day-bucketed place assignment derived from that date range
- A three-view planner living entirely inside the mobile bottom sheet
- Auto-loading a trip's pins onto the map when the trip is opened
- Adding places to a trip from a place detail panel and from Saved Places
- Tier gating on `itinerary`

### Out (v1)

Export to PDF / share link · AI-generated itineraries · sharing or
collaboration · per-place times, durations, or notes · drag-to-reorder ·
offline support · travel-time routing between stops.

---

## 2. Placement

**Saved becomes two segments: `Places | Trips`.** Trips is the default segment —
the planner is the primary reason to open Saved.

Two entry points, one destination:

- **Bottom nav → Saved** → Trips segment.
- **Hamburger → Build Itinerary** → switches `ShellMode` to `saved` and
  activates the Trips segment. This replaces the current "coming soon" toast at
  [MapView.tsx:1419](../../../frontend/src/components/MapView.tsx#L1419).

The bottom nav stays at four slots. It is visually full (see the reference
screenshots) and a fifth item would cramp it.

---

## 3. Navigation model

Three views inside the one pane, driven by **local state in the Trips
component**. `ShellMode` in [frontend/src/lib/shell.ts](../../../frontend/src/lib/shell.ts)
stays flat at its four values — this feature adds no mode.

### View 1 — Trip list

Header `Trips` + count, matching the existing `SavedBody` header pattern
(title, then a mono uppercase count line). Below it a scrollable list:

- A pinned `+ New Trip` row at the top
- One card per trip: **title**, date range, place count
  → `Beach Days · Mar 3–7 · 6 places`

Empty state mirrors `SavedBody`'s: an icon, a one-line headline, and a
sub-line explaining the first action.

### View 2 — Trip detail

Header becomes `‹ Beach Days` with the date range beneath and an edit
affordance for name/dates. Body is a scroll of day sections:

```
Day 1 · Mon Mar 3
  <PlaceCard> Caracas Beach
  <PlaceCard> El Resuelve
Day 2 · Tue Mar 4
  <PlaceCard> Mosquito Pier
Unscheduled
  <PlaceCard> Sun Bay
```

**On entering this view, every place in the trip is dropped on the map as a pin
and the camera fits their bounds.** This is the core requirement: selecting a
plan shows its locations without further interaction.

`Unscheduled` always renders last, and only when it has items or the trip has no
dates.

### View 3 — Place detail

The existing `PlaceDetailPanel`, unchanged, reached by tapping any place row.
Already shared by Explore and Saved; the planner is a third caller.

### Back behaviour

`‹` from view 2 returns to view 1, clears the trip's pins, and restores the
prior map state. Views 2 → 3 → 2 preserves the trip's pins throughout.

**Rejected alternatives.** An accordion (days nested inline) fails at scale —
3 trips × 5 days × 6 places is unusable in the ~431px map band, and day
reassignment has nowhere to live. A full-screen takeover breaks the
auto-load-pins requirement, since the user must see the map.

---

## 4. Creating and editing a trip

`+ New Trip` opens a compact form **inside the pane**, not a modal — the sheet
is the app's single display surface.

| Field | Rules |
|---|---|
| Name | required, 1–80 chars, trimmed |
| Start date | optional |
| End date | optional; must be ≥ start date |

**Day count is derived, never stored:** `end_date - start_date + 1`. Changing
the dates changes the number of day sections with no migration of item rows.

**Dateless trips are valid.** A trip with no dates renders as a single
`Unscheduled` bucket and functions as a themed list — the "Beach Days" case.
This keeps the simple use case cheap without a second data model.

**Cap: 14 days.** A 30-day pass could otherwise produce 30 day-sections in a
431px band. Enforced as a `CHECK` constraint and a validation line, so raising
it later is a one-line change. **Trips per user: unlimited.**

---

## 5. Assigning places to days

Two entry points:

1. **From a place** — place cards and `PlaceDetailPanel` gain an "Add to trip"
   action alongside the existing heart. Opens a picker: choose trip, then day
   (or Unscheduled).
2. **From Saved Places** — each row in the `Places` segment gains the same
   action. This is the flow that ties the two halves of Saved together and the
   reason Trips lives here rather than in its own tab.

Within a trip, a row's day is changed with a **day picker on the row**.

**Not drag-and-drop in v1.** A vertical drag inside a scrolling list that itself
sits in a sheet which drags between snap points is a three-way gesture conflict.
`sort_order` exists in the schema so reordering can be added later without a
migration.

---

## 6. Data model

Two tables, following [db/migrations/0032_favorites.sql](../../../db/migrations/0032_favorites.sql)
exactly: namespaced `place_id`, whitelisted `snapshot jsonb`, per-user RLS.

```sql
itineraries
  id          uuid pk default gen_random_uuid()
  user_id     uuid not null → auth.users(id) on delete cascade
  title       text not null    CHECK (char_length(btrim(title)) between 1 and 80)
  start_date  date null
  end_date    date null
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()
  CHECK (start_date is null) = (end_date is null)   -- both or neither
  CHECK (end_date >= start_date)
  CHECK (end_date - start_date <= 13)               -- 14 days inclusive

itinerary_items
  id            uuid pk default gen_random_uuid()
  itinerary_id  uuid not null → itineraries(id) on delete cascade
  place_id      text not null  CHECK (place_id ~ '^[a-z]+:[A-Za-z0-9._-]+$')
  place_kind    text not null  CHECK (place_kind IN (
                  'beach','restaurant','stay','activity','service',
                  'transport','essential','snorkel','kayak','trail'))
  place_ref     text not null
  day_index     int null       CHECK (day_index between 0 and 13)
  sort_order    int not null default 0
  snapshot      jsonb not null default '{}'::jsonb
  created_at    timestamptz not null default now()
  UNIQUE (itinerary_id, place_id)
```

### Design notes

**`snapshot jsonb` is what makes pins auto-load in one query.** A trip spans up
to ten listing tables; resolving live would be a ten-way fan-out for a list of
six items. The snapshot is the card — name, subtitle, coords, tags, icon —
written at add time and allowed to go stale. Tapping a row loads the live row
anyway. Keys are whitelisted server-side; otherwise this column is a free
per-user blob store.

**`place_kind` / `place_ref` are derived server-side** by splitting `place_id`,
never read from the request body. Same rule as favorites.

**`day_index` is nullable, and its CHECK is the absolute 14-day cap (0–13) — not
the individual trip's current length.** These are two different bounds and the
distinction matters: nothing in the database ties an item's day to the trip's
date range. Shortening a trip must never delete a user's work, so an item left
on day 4 of a now-3-day trip keeps `day_index = 3` in the row and is rendered
under `Unscheduled`. That is a UI-layer fallback, not a data repair — lengthen
the trip again and the item reappears on day 4 where the user put it.

**`UNIQUE (itinerary_id, place_id)`** makes adds idempotent — a place appears at
most once per trip, so a double-tap cannot duplicate it. Moving days is an
`UPDATE`, not a delete-and-insert.

**RLS:** `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies on `itineraries`
scoped to `auth.uid() = user_id`. `itinerary_items` policies check ownership
through a join to the parent trip. Unlike favorites, `UPDATE` **is** allowed
here — renaming a trip and moving an item between days are both edits.

**Index:** `(user_id, updated_at DESC)` on trips — the only list read.
`(itinerary_id, day_index, sort_order)` on items — the only detail read.

---

## 7. API

Six routes, all `requireAuth` + `requireTier(pool, 'itinerary')`. Ownership is
verified against `user_id` on every route, never trusted from the client.

| Route | Purpose |
|---|---|
| `GET /api/itineraries` | List: title, dates, item count. No items. |
| `POST /api/itineraries` | Create |
| `PATCH /api/itineraries/:id` | Rename / change dates |
| `DELETE /api/itineraries/:id` | Delete (items cascade) |
| `GET /api/itineraries/:id` | Full trip with all items |
| `PUT /api/itineraries/:id/items` | Add / move / remove an item |

The list route deliberately omits items — the trip list only needs a count, and
sending every snapshot for every trip would be the largest response in the app
for the least-used data.

Snapshot keys are whitelisted in the route layer before insert, matching the
favorites route's existing helper.

---

## 8. Tier gating

Gated on `itinerary` (Exploration). This differs from favorites, which is
deliberately ungated retention — the trip planner is the tier's headline
feature.

Lower tiers see the Trips segment with the existing
[UpsellOverlay](../../../frontend/src/components/UpsellOverlay.tsx), driven by
the `FEATURE_MIN_TIER` map in
[frontend/src/lib/entitlement.tsx](../../../frontend/src/lib/entitlement.tsx).

With something real behind the slug, the hamburger item can finally be wired to
`useFeature('itinerary')` — removing the deliberate workaround documented at
[MapTopBar.tsx:129](../../../frontend/src/components/MapTopBar.tsx#L129), which
avoided gating a control that led nowhere.

---

## 9. Files

### New

```
db/migrations/0045_itineraries.sql
backend/itineraries.js                      route handlers
frontend/src/hooks/useItineraries.ts        optimistic, mirrors useFavorites
frontend/src/components/TripsBody.tsx       view 1 — trip list
frontend/src/components/TripDetailBody.tsx  view 2 — days + places
frontend/src/components/TripForm.tsx        create / edit name + dates
frontend/src/components/AddToTripSheet.tsx  trip + day picker
```

### Modified

```
backend/server.js                  mount the itineraries router
frontend/src/lib/api.ts            six fetch wrappers
frontend/src/components/SavedBody.tsx    Places | Trips segment control
frontend/src/components/MapView.tsx      active-trip pin source
frontend/src/components/MapTopBar.tsx    wire Build Itinerary to the real view
frontend/src/components/PlaceCard.tsx    "add to trip" action
frontend/src/components/PlaceDetailPanel.tsx  "add to trip" action
```

`MapView.tsx` is already 1441 lines. All planner logic lives in its own
components; MapView gains only a pin source, not trip behaviour.

---

## 10. Error handling

Follows the optimistic pattern established in
[useFavorites.ts](../../../frontend/src/hooks/useFavorites.ts): apply locally,
fire the request, roll back the row on failure. A planner that waits on a round
trip before showing a change reads as broken on one bar of LTE.

- **Load failure** → empty list, not an error screen. The planner is additive.
- **Create/rename failure** → roll back, keep the form open with its input.
- **Add-to-trip failure** → remove the optimistic row, leave a toast.
- **402 from the tier gate** → the upsell overlay, not an error.
- **Deleting a trip** → confirm first; it cascades to every item.

---

## 11. Testing

- **Schema:** day-range CHECK rejects a 15-day trip; both-or-neither date CHECK;
  cascade delete removes items; `UNIQUE` makes a duplicate add a no-op.
- **RLS:** user A cannot read, update, or delete user B's trips or items —
  including through the items table's parent join.
- **Routes:** each returns 402 below Exploration; ownership enforced on all six;
  `place_kind` is derived, not accepted from the body; snapshot keys outside the
  whitelist are stripped.
- **Day derivation:** a 5-day range yields 5 sections; shortening to 3 days
  moves days 4–5 into Unscheduled without data loss; a dateless trip renders one
  Unscheduled bucket.
- **Pins:** opening a trip loads every item's pin and fits bounds; going back
  clears them; entering a place detail and returning preserves them.
- **Optimistic rollback:** a failed add removes the row.

---

## 12. Open items for later

- `itinerary_export` — PDF / share link. Deferred by decision; build after the
  planner works.
- Drag-to-reorder within a day (`sort_order` already exists for it).
- AI-assisted trip generation — the reserved Anthropic client at
  [server.js:61](../../../backend/server.js#L61) is for this.
- Travel time between consecutive stops, via the existing `/api/directions`.
