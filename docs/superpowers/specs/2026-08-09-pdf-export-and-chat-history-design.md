# Itinerary PDF Export & AI Chat History — Design

**Date:** 2026-08-09
**Status:** Approved, ready for implementation planning

Two features whose feature slugs already exist in the tier ladder but whose
implementations do not: `itinerary_export` (Exploration) and `ai_history`
(Vacation and up). Both slugs are already listed in `FEATURES` in
`backend/payments.js` and in `FEATURE_LABELS` / `FEATURE_MIN_TIER` in
`frontend/src/lib/entitlement.tsx`, so no pricing change is required — this
work makes two already-sold promises real.

---

## Feature 1 — Itinerary PDF export

### Why server-side

Generation runs on the backend, not in the browser. `entitlement.tsx` states
outright that client-side gating is "a UX layer, not a security boundary" — a
client-generated PDF would let anyone below Exploration take a paid feature by
flipping a boolean in DevTools. The backend already owns the trip data and can
enforce the tier for real.

`pdfkit` over Puppeteer: ~1MB and no Chromium, which matters on Railway.

### Endpoint

```
GET /api/itineraries/:id/export.pdf
```

Mounted in `backend/itineraries.js` alongside the existing trip routes.

**Gate:** `[requireAuth, requireTier(pool, 'itinerary_export'), rateLimit({ max: 10 })]`

The limit is lower than the trip routes' 60: a PDF render is the most expensive
operation in the file (one `loadDetail` plus up to ten listing queries plus
document generation), and no human exports the same trip more than a few times
a minute.

Ownership is proven by `user_id = $userId` in the WHERE clause, exactly as
every other route in this file does — these routes connect as the table owner
and bypass RLS, so the SQL predicate is the actual enforcement.

**Response:** `Content-Type: application/pdf`, `Content-Disposition:
attachment; filename="<slugified-trip-title>.pdf"`. The document streams
directly to `res` rather than buffering.

### Data resolution

The `snapshot` jsonb holds `name`, `subtitle`, `tags`, `latitude`, `longitude`
and an emoji `icon` — but not address, phone, or hours. Those are the fields
that make a printed itinerary worth carrying, so the export resolves them live.

1. `loadDetail(id, userId)` — the existing function, unchanged.
2. Group items by `place_kind`, then issue **one query per distinct kind**
   using `WHERE ref = ANY($1)`. Ten kinds exist, so a trip of any size costs at
   most ten queries.
3. Merge: live listing fields win; snapshot fields fill gaps.

The fan-out warning in `0045_itineraries.sql` is about the map render path,
which runs constantly. This is a deliberate one-shot operation where a few
hundred milliseconds is acceptable.

**A place deleted from its listing table since it was added must not fail the
export.** The snapshot is the fallback, so the entry still prints with name and
subtitle.

### Document layout

- **Cover block** — trip title, formatted date range, total place count
- **One section per day** — heading `Day 1 · Sat, Mar 7` (omit the date part
  for dateless trips), then each place:
  - name, preceded by its kind emoji
  - subtitle
  - address and phone when resolved
  - a Google Maps URL derived from lat/lng
- **Unscheduled section last** — items with `dayIndex === null` or a
  `dayIndex` beyond the trip's current length, matching `TripDetailBody`'s
  bucketing so the PDF and the screen agree
- Empty days print "Nothing planned", as the UI does

### Frontend

A download button in `TripDetailBody`'s header, beside the existing pencil.
Calls the endpoint with the auth header, receives a blob, triggers a download.

The button is **hidden, not disabled**, below Exploration: `TripsBody` already
renders `UpsellOverlay` for locked users, so a second upsell inside the detail
view would be redundant.

---

## Feature 2 — AI chat history

### Storage model

Two tables mirroring `itineraries` / `itinerary_items` — the same parent/child
shape, the same per-user RLS on the parent and by-join RLS on the child. No new
concepts enter the codebase.

**Migration `0046_ai_conversations.sql`:**

```
public.ai_conversations
  id           uuid PK
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80)
  created_at   timestamptz NOT NULL DEFAULT now()
  updated_at   timestamptz NOT NULL DEFAULT now()

public.ai_messages
  id               uuid PK
  conversation_id  uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE
  role             text NOT NULL CHECK (role IN ('user','assistant'))
  content          text NOT NULL
  pins             jsonb NOT NULL DEFAULT '[]'::jsonb
  seq              int NOT NULL
  created_at       timestamptz NOT NULL DEFAULT now()
  UNIQUE (conversation_id, seq)
```

**Indexes:**
- `(user_id, updated_at DESC)` on conversations — the only list read
- `(conversation_id, seq)` on messages — the only transcript read

**RLS:** per-user on `ai_conversations`; `EXISTS`-join to the parent on
`ai_messages`, with the subquery on both `USING` and `WITH CHECK` for UPDATE so
a message cannot be re-parented into another user's conversation.

`seq` rather than ordering by `created_at`: two messages written in the same
request can share a timestamp, and the transcript's order is not allowed to be
ambiguous.

**Why `pins` per message:** reopening a conversation restores the map pins that
conversation produced. Storing them on the assistant message that generated
them keeps each reply's pins with the reply.

### Persistence inside `/api/ai/chat`

The route gains an optional `conversationId` in the body.

- **Absent** → create a conversation, title = the first user message truncated
  to 80 characters. Return the new `conversationId` in the response.
- **Present** → verify `user_id` ownership, append, bump `updated_at`.
  A `conversationId` that is not the caller's is treated as absent (a new
  conversation is started) rather than erroring — the user has already paid a
  credit and must receive their answer.

Writes happen **after** the model returns, inside the request that already
spent the credit. A separate client-issued save request could fail and lose a
reply the user paid for.

**A persistence failure must not fail the request.** The credit is spent and
the answer exists; losing the transcript is strictly better than losing the
reply. Wrap the writes so an error is logged and the response still returns.

**Free tier stays ephemeral.** Persistence is skipped entirely unless the
caller's tier includes `ai_history` (checked with the existing `tierHas`).
Storing data a user cannot read is a privacy oddity and a storage cost with no
revenue attached.

Title generation is a truncation, not a second model call — no hidden inference
cost, and in this domain the user's own question ("Where can I get seafood?")
is a better list entry than a summary of it.

### Routes

All gated `[requireAuth, requireTier(pool, 'ai_history')]`:

| Route | Purpose |
|---|---|
| `GET /api/ai/conversations` | List. **No messages** — same reasoning as the itineraries LIST route: shipping every transcript for the least-read data would be the largest response in the app. Returns id, title, messageCount, updatedAt. |
| `GET /api/ai/conversations/:id` | One transcript, messages ordered by `seq`, pins included. |
| `PATCH /api/ai/conversations/:id` | Rename. Validates the same 1–80 char rule as the CHECK constraint, so the user gets a sentence rather than a generic 500 from a 23514. |
| `DELETE /api/ai/conversations/:id` | Delete. Messages cascade. |

Mutating routes carry `rateLimit({ max: 60 })`, matching favorites and trips.
A zero-row PATCH or DELETE returns 404, not a silent 200 — the same rule the
trip item routes follow.

### Frontend

**`lib/aiChat.tsx`** gains to its context value:

- `conversationId: string | null`
- `conversations: ConversationSummary[]`
- `historyLoading: boolean`
- `newChat()` — clears messages and `conversationId`; creates nothing until the
  first send
- `openConversation(id)` — loads the transcript, replays its pins
- `renameConversation(id, title)`, `deleteConversation(id)`

`send()` passes the current `conversationId` and stores the one that comes
back. Deleting the open conversation resets to a new empty chat.

**`AiChatBody.tsx`** gains `view: 'chat' | 'history'` state and a history
toggle in the header. Chat is the default view; history is pushed over it and
pops back on selecting a conversation or starting a new one. This is the
master/detail relationship `TripsBody` → `TripDetailBody` already uses — not
the segmented-tab pattern of `SavedBody`, because the transcript is the primary
surface and history is an occasional visit, and a permanent tab bar would cost
a row of height in a panel where the transcript is the content.

**`AiChatHistoryBody.tsx`** — new component. The conversation list, date-grouped
("Today" / "Yesterday" / "Earlier"), `+ New chat` at the top, and a `⋯` menu per
row with rename and delete. Delete asks for confirmation inline.

The menu uses the same pattern as `TripDetailBody`'s per-item menu and is
available on **both platforms** — `AiChatBody` is the shared tree that desktop's
`AiChatPane` and the mobile sheet both render, so neither needs a separate
implementation.

A new component rather than more of `AiChatBody`: that file is 172 lines and
would pass 280 with the list, the grouping, and the menus inline.

**Below Vacation**, the history toggle is hidden and the chat behaves exactly as
it does today.

---

## Testing

- **PDF export:** tier gating (Exploration passes, below fails 402), ownership
  (another user's trip 404s), a trip whose place was deleted from its listing
  table still exports, dateless trips render Unscheduled only, response is a
  valid PDF.
- **Chat history:** a conversation is created on first send and not before;
  the second send appends rather than creating; free tier persists nothing;
  another user's `conversationId` starts a fresh conversation instead of
  writing into theirs; a persistence failure still returns the reply; rename
  rejects empty and >80-char titles; delete cascades messages; reopening
  restores pins.

## Out of scope

- AI-generated conversation titles (a second inference per conversation)
- Search across conversations
- Sharing or exporting a conversation
- Editing or regenerating past messages
- PDF map images — the layout is text plus Maps links
