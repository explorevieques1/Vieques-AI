# PLATFORM.md — From Explore Vieques to a Multi-Destination Travel AI Platform

**Status:** strategy + implementation plan. Written 2026-08-02.
**Audience:** you, six months from now, standing up destination #2 from a laptop in a café.

---

## 0. The thesis in one paragraph

Explore Vieques is not a Vieques app. It is a **destination operating system** that
currently has exactly one destination loaded into it. Everything expensive —
the auth/payments/entitlement spine, the ten-kind `Place` view model, the mobile
sheet shell, the AI tool-use loop, the tier gate, the Stripe webhook — is
destination-agnostic *already*. What is Vieques-specific is a thin, countable
skin: a map center, a system prompt, a logo, a set of category labels, and rows
in Postgres. The business goal is therefore not "rewrite this for Old San Juan."
It is **make the skin a config file, and make a new destination a checklist you
can run in a day.**

The prize: each destination is a near-zero-marginal-cost clone. Destination #1
cost ~40 migrations and months. Destination #5 should cost a weekend of data
entry. That gap is the entire company.

---

## 1. What you actually have (audit, verified against the code)

### 1.1 The four deployables

| Piece | Path | Stack | Host | Location-coupled? |
|---|---|---|---|---|
| Landing / marketing / auth / checkout | [landing/](landing/) | React + Vite, plain JSX, hand-written CSS | Vercel | **Heavily** (copy, brand) |
| Map app (the product) | [frontend/](frontend/) | React + Vite + TS + Tailwind + MapLibre + vaul | Vercel | **Lightly** (2 constants + labels) |
| API gatekeeper | [backend/](backend/) | Node/Express ESM, 2.6k LOC | Railway | **Lightly** (prompt + 1 coord) |
| Schema + seeds | [db/](db/) | Postgres 40 migrations, PostGIS, pgvector | Supabase | **Structurally no**, data yes |

Plus [cli/vqctl.js](cli/vqctl.js) (ops helper) and [data/](data/) (raw CSV/GeoJSON
source material — the "how a destination gets built" evidence trail).

### 1.2 The parts that are already generic — do not touch these

These are your moat. They took the longest and they carry over 1:1:

- **Payments + entitlement.** [backend/payments.js](backend/payments.js) —
  `PLANS`, `FEATURES`, `DEVICE_LIMITS`, `tierHas()`, `bestTier()`,
  `createCheckoutSession()`, `handleWebhook()`, `getEntitlement()`. Zero mention
  of Vieques. A four-rung traveler ladder (free → day_trip → vacation →
  exploration) and a four-rung business ladder. This is a *product* concept, not
  an island concept.
- **Tier gating middleware.** `requireAuth` + `requireTier(pool, 'beach_names')`
  wraps every one of the ~30 endpoints in [backend/server.js](backend/server.js).
  Feature slugs (`beach_names`, `snorkel_zones`, `directions`, `itinerary`) are
  abstract capabilities, not island facts.
- **The `Place` view model.** [frontend/src/lib/place.ts](frontend/src/lib/place.ts)
  collapses ten unrelated backend types into one presentation shape via adapters.
  This is the single best architectural decision in the codebase and it is why a
  new destination with different content types is cheap.
- **The mobile shell.** One permanently-mounted vaul sheet, `ShellMode` in
  [frontend/src/lib/shell.ts](frontend/src/lib/shell.ts), the snap-point math in
  [useMapInsets.ts](frontend/src/hooks/useMapInsets.ts). Painfully earned
  (see the vaul translate math in your memory notes). Fully portable.
- **Data-driven filters.** [frontend/src/lib/filters.ts](frontend/src/lib/filters.ts)
  derives chips from `Place.tags` rather than hardcoding per-category panels.
  Means a new destination's filters *appear on their own* from its data.
- **AI provider abstraction.** [backend/aiProvider.js](backend/aiProvider.js) —
  OpenAI wire format, so gemini/ollama/openai swap by env var. Cheap model for
  chat, Claude reserved for the itinerary builder.
- **Auth + cross-origin session hand-off.** Supabase JWT, URL-hash token pass
  from landing → map app (`landing/src/lib/mapApp.js` → `AccessGate.tsx`).
- **RLS + append-only credit ledger.** Migrations 0016–0024.

### 1.3 The parts that are location-coupled (the complete list)

This is shorter than you'd fear. Verified by grep across all source:

**Hard geography (2 constants):**
- `VIEQUES_CENTER = [-65.44, 18.12]` — [frontend/src/components/MapView.tsx:65](frontend/src/components/MapView.tsx#L65), used at initial `center`, and the "recenter" button fallback at line 1390. Initial `zoom: 12`.
- `VIEQUES_COORDS = { lat: 18.12, lng: -65.44 }` — [backend/server.js:1134](backend/server.js#L1134), feeds Open-Meteo. Comment says "matches VIEQUES_CENTER in MapView" — an undeclared coupling between two files in two repos-worth of code. **This is exactly the class of bug the config file eliminates.**
- Timezone `America/Puerto_Rico` hardcoded in the weather call.

**AI prompt (2 files):**
- `SYSTEM_PROMPT` — [backend/server.js:935](backend/server.js#L935): "You are the Vieques AI assistant… the island of Vieques, Puerto Rico."
- Tool descriptions — [backend/aiTools.js](backend/aiTools.js) lines 28, 58, 85, 120, 144. Each says "on Vieques." Worse, line 58 encodes *data-state* facts in prose: "Only two categories currently have listings: car-rental and taxis. There are NO airline, ferry, water-taxi, or golf-cart listings." That sentence is true for Vieques today and false for Old San Juan on day one.

**Routing seed:**
- `fetchDirections('Vieques Ferry Terminal', p.name)` — [MapView.tsx:903](frontend/src/components/MapView.tsx#L903). A hardcoded default origin. Old San Juan's equivalent is a cruise pier; Condado's is a hotel strip.

**Branding / copy:**
- [landing/src/pages/Home.jsx](landing/src/pages/Home.jsx) — 10 mentions, plus the entire hero narrative.
- `NavBar.jsx`, `SignUp.jsx`, `LogIn.jsx`, `Pricing.jsx`, `Account.jsx` — 1 each.
- `landing/index.html` (title/meta), `landing/public/styles.css` (2).
- `frontend/index.html`, `frontend/src/index.css`, and the map attribution string "© Explore Vieques · MapTiler · OpenStreetMap" ([MapView.tsx:1407](frontend/src/components/MapView.tsx#L1407)).
- Empty-state / header fallback `'Explore Vieques'` at [MapView.tsx:1226](frontend/src/components/MapView.tsx#L1226) and 1274.

**Category taxonomy (semi-coupled):**
- `CATEGORIES` — [frontend/src/lib/place.ts:171](frontend/src/lib/place.ts#L171): beaches, restaurants, activities, stays, services, transportation, essentials. **Beaches is not universal.** Old San Juan wants *Historic Sites*; Condado wants *Nightlife* and *Shopping*; Culebra keeps Beaches. The seven-category list is a Vieques editorial choice wearing a type definition's clothes.

**Infra names:**
- `DB_NAME=vieques_ai`, `DB_USER=vieques_app` (local fallback only — prod uses `DATABASE_URL`).
- Domain strings in `.env.example` files and `withWwwTwin(LANDING_URL)` CORS logic (already env-driven — good).

### 1.4 Honest assessment of readiness

The good: the coupling is ~200 lines across ~15 files, and none of it is
architectural. There is no place where "island-ness" is baked into a data
structure or a query plan.

The bad, and you should fix these *before* cloning, not after:
1. **Vieques-flavored table names in the schema.** `beaches`, `snorkel_spots`,
   `kayak_zones`, `snorkel_tour_operators`. These are content-type tables, and
   Old San Juan needs `historic_sites` and `museums` instead. Cloning the schema
   as-is gives destination #2 four empty tables it will never use and no table
   for what it actually sells.
2. **The `listings` / `categories` generic tables from 0001_foundation exist but
   went unused** — the app grew seven parallel `*_listings` + `*_categories` +
   `*_listing_categories` triples instead. That was right for speed. It is wrong
   for a platform, because every new content type is now ~3 tables + 1 endpoint
   pair + 1 adapter + 1 hook branch.
3. **40 sequential migrations with no reset path.** There is no
   `schema.sql` snapshot. Standing up destination #2's database means replaying
   40 files including Vieques *seed data* (`0005_snorkel_seed`, `0010_car_rental_seed`,
   `0011_taxi_seed`, `0026_trails_import_and_seed`, `0034_kayak_seed`,
   `db/seeds/*`). Structure and content are interleaved. **This is the single
   biggest blocker to fast cloning.**
4. **No `destination` concept anywhere.** Not in the schema, not in the config,
   not in the env.

---

## 2. The strategic fork: three ways to become multi-destination

You must pick one before writing code. They are not equally good and I recommend
the third.

### Option A — Fork the repo per destination
`explore-vieques` → copy → `explore-old-san-juan`. Separate Supabase, separate
Vercel projects, separate Railway service.

- **Pro:** zero refactor, ship destination #2 next week, blast radius of a bug is one destination.
- **Con:** every bug fix and feature is now an N-way manual port. At N=4 you spend
  most of your time cherry-picking. The company stops compounding.
- **Verdict:** the trap. Feels fast, caps you at ~3 destinations.

### Option B — One database, one deployment, `destination_id` on every row
A single app that serves all destinations, switched by subdomain or path.

- **Pro:** one deploy, one codebase, true platform economics. Cross-destination
  features (a Puerto Rico–wide pass) become possible.
- **Con:** big-bang refactor of 40 migrations and 30 endpoints before you ship
  anything new. RLS gets harder. One bad deploy takes down every destination.
  Content types still diverge (beaches vs historic sites) so you get sparse,
  nullable mega-tables or JSONB soup.
- **Verdict:** right destination, wrong first step. This is where you end up at
  N=8, not how you get to N=2.

### Option C — **Shared core + per-destination config + per-destination data** ✅
One git repo. One codebase. A `destinations/<slug>/` config directory. Each
destination gets its own Supabase project and its own Vercel/Railway
*deployments*, but they all build from the same source, parameterized at build
and boot time by `DESTINATION=old-san-juan`.

- **Pro:** every fix lands everywhere on next deploy. Isolation of data and blast
  radius is preserved. No mega-table problem — each destination's DB has only the
  content tables it needs, chosen from a **module catalog**. Migration path to
  Option B later stays open (config becomes rows).
- **Con:** requires the config extraction work up front (~2 weeks) and you manage
  N Supabase projects (cheap, and Supabase free tier covers a new destination
  through validation).
- **Verdict:** this is the plan. The rest of the document assumes it.

---

## 3. Target architecture

```
travel-ai/                          ← one repo, one npm workspace
├── destinations/
│   ├── vieques/
│   │   ├── destination.json        ← THE config file (see §4)
│   │   ├── brand/                  ← logo.svg, og.png, hero.jpg, favicon
│   │   ├── copy/                   ← landing.md / hero, faq, seo per locale
│   │   ├── modules.json            ← which content modules this destination loads
│   │   └── seed/                   ← CSVs: beaches.csv, restaurants.csv, …
│   ├── old-san-juan/
│   ├── condado/
│   └── culebra/
├── packages/
│   ├── config/                     ← loads + validates destination.json (zod)
│   ├── core-db/                    ← identity/payments/AI migrations (universal)
│   └── modules/                    ← content modules, one folder each (see §5)
│       ├── beaches/                ← migration + endpoint + adapter + icons
│       ├── restaurants/
│       ├── historic-sites/         ← NEW, for Old San Juan
│       ├── nightlife/              ← NEW, for Condado
│       └── …
├── apps/
│   ├── landing/                    ← today's landing/, de-branded
│   ├── map/                        ← today's frontend/, de-hardcoded
│   └── api/                        ← today's backend/, config-driven
└── tools/
    ├── new-destination.mjs         ← the scaffolder (see §7)
    └── seed.mjs                    ← CSV → Postgres importer
```

Everything the user sees that says "Vieques" comes from
`destinations/vieques/`. Everything else is shared.

---

## 4. `destination.json` — the single source of truth

This file *is* the template. Getting its shape right is the highest-leverage
decision in this whole plan. Draft:

```jsonc
{
  "slug": "old-san-juan",
  "name": "Old San Juan",
  "brandName": "Explore Old San Juan",
  "tagline": "500 years of history in seven square blocks",
  "kind": "historic-district",          // island | historic-district | resort-strip

  "geo": {
    "center": [-66.117, 18.466],        // replaces VIEQUES_CENTER *and* VIEQUES_COORDS
    "zoom": 15,                          // denser than Vieques' 12
    "bounds": [[-66.13, 18.458], [-66.105, 18.475]],
    "timezone": "America/Puerto_Rico",
    "locales": ["en", "es"],
    "units": "imperial"
  },

  "routing": {
    "defaultOrigin": "Pan American Pier",   // replaces 'Vieques Ferry Terminal'
    "profile": "foot"                        // Vieques is 'car'; OSJ is walkable
  },

  "domains": {
    "landing": "https://exploreoldsanjuan.com",
    "app":     "https://app.exploreoldsanjuan.com",
    "api":     "https://api.exploreoldsanjuan.com"
  },

  "theme": {
    "primary": "#0ea5e9",
    "accent":  "#f59e0b",
    "mapStyle": "streets-v2",           // Vieques uses a satellite-ish outdoor style
    "logo": "brand/logo.svg"
  },

  "categories": [                        // replaces the hardcoded CATEGORIES array
    { "module": "historic-sites", "label": "Historic Sites", "icon": "Landmark",  "color": "#b45309" },
    { "module": "restaurants",    "label": "Restaurants",    "icon": "UtensilsCrossed", "color": "#f97316" },
    { "module": "stays",          "label": "Stays",          "icon": "BedDouble", "color": "#8b5cf6" },
    { "module": "nightlife",      "label": "Nightlife",      "icon": "Martini",   "color": "#ec4899" },
    { "module": "essentials",     "label": "Essentials",     "icon": "ShoppingBasket", "color": "#f59e0b" },
    { "module": "transportation", "label": "Getting Around", "icon": "Car",       "color": "#eab308" }
  ],

  "ai": {
    "persona": "a friendly local guide for Old San Juan, Puerto Rico's walled colonial city",
    "hints": [
      "Distances are short — almost everything is a 5-15 minute walk.",
      "Streets are cobblestone (adoquines); warn about heels and strollers.",
      "Cruise-ship days are crowded; mention early mornings."
    ]
    // NOTE: never hand-write "we have no ferry listings" — see §6.3
  },

  "pricing": {
    "ladder": "traveler-v1",            // reuse the shared ladder…
    "overrides": { "day_trip": { "price": 599 } }   // …but a walkable district is cheaper
  },

  "launch": { "stage": "beta", "businessListings": false }
}
```

**Rules for this file:**
- Validated by zod at build time in `packages/config`. A missing `geo.center`
  should fail the build, not produce a map over the Atlantic.
- The map app gets it at **build time** (Vite `define`, so it tree-shakes and
  ships one destination per bundle). The API gets it at **boot time** (reads
  `DESTINATION` env var, loads the JSON).
- Copy that is long-form (hero paragraphs, FAQ, SEO) lives in
  `copy/*.md`, not in JSON. JSON is for structured facts.

---

## 5. Content modules — how you avoid the beaches-vs-historic-sites problem

The insight: **not every destination sells the same things.** Vieques sells
beaches and bio bay. Old San Juan sells forts, museums, and cobblestone streets.
Condado sells beach clubs, nightlife, and shopping. Culebra sells one beach so
famous it's the whole trip.

So don't build one universal schema. Build a **catalog of content modules** and
let `modules.json` pick.

A module is a self-contained vertical slice:

```
packages/modules/historic-sites/
├── migration.sql        # CREATE TABLE historic_sites (…) + categories + RLS
├── api.js               # GET /api/historic-sites, /api/historic-sites/:slug
├── adapter.ts           # HistoricSite → Place  (the §1.2 pattern)
├── tool.js              # the AI tool definition: search_historic_sites
├── icons.ts             # marker styles
└── module.json          # { "slug": "historic-sites", "kind": "historic",
                          #   "tierFeature": "historic_sites", "seedColumns": [...] }
```

**Every module conforms to one contract**, which the existing code already
implies but never named:

1. It owns Postgres tables named after itself.
2. It exposes `GET /api/<module>` (list) and optionally `/:slug` (by category).
3. It ships an adapter to `Place` — this is the whole reason the map app doesn't
   care what a module is.
4. It declares a tier feature slug for `requireTier`.
5. It ships an AI tool whose description is **generated**, not written (§6.3).
6. It declares its seed CSV columns so `tools/seed.mjs` can import without
   custom code.

**Launch catalog** (v1 — mostly extraction of what exists):

| Module | Exists today | Vieques | OSJ | Condado | Culebra |
|---|---|---|---|---|---|
| `beaches` | ✅ | ✅ | — | ✅ | ✅ |
| `restaurants` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `stays` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `activities` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `essentials` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `transportation` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `services` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `snorkel` (spots+zones) | ✅ | ✅ | — | — | ✅ |
| `kayak` (spots+zones) | ✅ | ✅ | — | — | — |
| `trails` | ✅ | ✅ | — | — | — |
| `historic-sites` | ❌ new | — | ✅ | — | — |
| `nightlife` | ❌ new | — | ✅ | ✅ | — |
| `shopping` | ❌ new | — | ✅ | ✅ | — |
| `walking-tours` | ❌ new | — | ✅ | — | — |

Note the payoff: **Culebra is 100% existing modules.** It is a pure config +
data destination — no new code at all. That makes Culebra the correct
destination #2, not Old San Juan. (See §8.)

Also note the two *generic* modules worth building, because they cover most
future content types without new code:
- **`poi`** — a generic point-of-interest module with `subtype`, `tags[]`,
  freeform `attributes jsonb`. Anything that's "a pin with a name, photos,
  hours, and some tags" can be a `poi` subtype rather than a new module. Reach
  for a dedicated module only when the content has *structured queries* of its
  own (snorkel zones have geometry and depth; historic sites have an era filter).
- **`zones`** — polygon overlays, generalized from `snorkel_zones` + `kayak_zones`
  (they're already near-identical). One module, many uses: dive zones, walking
  loops, nightlife districts, no-swim areas.

---

## 6. The specific refactors, with the reasoning

### 6.1 Split schema from seed (do this first)
The 40 migrations interleave structure and Vieques content. Produce:

- `packages/core-db/migrations/` — identity, subscriptions, credits, RLS,
  pricing tiers, favorites, suggestions. Universal. (Extracted from 0016–0024,
  0031, 0032.)
- `packages/modules/*/migration.sql` — one per content type, structure only.
- `destinations/vieques/seed/*.csv` — the actual Vieques rows, exported out of
  the seed migrations (`0005`, `0010`, `0011`, `0012`, `0026`, `0034`,
  `db/seeds/*`) into CSV.

Then `tools/seed.mjs <destination>` walks `modules.json`, applies each module's
migration, and COPYs the destination's CSVs. **A new database becomes one
command.** Squash the 40 into a clean baseline while you're in there — you have
one production DB, so this is as cheap as it will ever be.

### 6.2 Config injection into the three apps

**Map app** — replace the two constants and the labels:
```ts
// packages/config/client.ts, injected via vite define
import { destination } from '@travel/config'
const CENTER = destination.geo.center      // was VIEQUES_CENTER
const ZOOM   = destination.geo.zoom
```
`CATEGORIES` in [place.ts](frontend/src/lib/place.ts#L171) becomes a function of
`destination.categories`, resolving `icon` strings to Lucide components through a
lookup map. The `'Explore Vieques'` fallbacks become `destination.brandName`. The
attribution string becomes a template.

**API** — `DESTINATION=vieques` env var; boot loads the JSON. Weather coords and
timezone come from `destination.geo` (killing the "matches VIEQUES_CENTER"
comment-as-documentation coupling). `SYSTEM_PROMPT` becomes a template function.

**Landing** — biggest copy surface. Move hero/FAQ/SEO into
`destinations/<slug>/copy/*.md` and render through a tiny markdown component.
Everything else is `destination.brandName` / `theme`.

### 6.3 Generate AI tool descriptions — don't write them
[backend/aiTools.js:58](backend/aiTools.js#L58) hardcodes "Only two categories
currently have listings: car-rental and taxis. There are NO airline, ferry,
water-taxi, or golf-cart listings." That is a *runtime data fact* frozen into a
string. It is already fragile for Vieques (add a ferry listing and the AI starts
lying) and flatly wrong for any other destination.

Fix: at boot, query `SELECT DISTINCT slug FROM <module>_categories WHERE EXISTS
(listings)` and build the tool description from the result plus the module's
static blurb and `destination.name`. The AI then always describes what the
database actually contains. This is a real bug fix, not just a template concern.

### 6.4 Everything else that must move
- `fetchDirections('Vieques Ferry Terminal', …)` → `destination.routing.defaultOrigin`.
- OSRM profile → `destination.routing.profile` (walkable districts need `foot`).
- `DB_NAME`/`DB_USER` local fallbacks → `${slug}_ai` / `${slug}_app`.
- Add `destination` to the Stripe checkout metadata alongside `plan` and
  `user_id`, so one Stripe account can serve all destinations and the webhook
  knows which product was bought.

### 6.5 The tablet gap — fix once, benefit N times
Your memory file flags it: 641–1024px renders the desktop two-panel layout
(~764px of chrome) and an iPad portrait has no map left. **Fix it before
cloning.** Fixed once now; fixed N times if you clone first. Same logic applies
to every known bug — the pre-clone window is the cheapest time to fix anything.

---

## 7. `tools/new-destination.mjs` — the artifact that makes this a company

The scaffolder is the product of this whole exercise. It should do:

```bash
npx new-destination \
  --slug culebra --name "Culebra" \
  --center -65.28,18.31 --zoom 13 \
  --modules beaches,restaurants,stays,activities,essentials,transportation,snorkel
```

and produce:

1. `destinations/culebra/` with `destination.json`, `modules.json`, empty
   `seed/*.csv` **with correct headers per module**, and `copy/` stubs.
2. A Supabase project (via management API) with core-db + selected module
   migrations applied.
3. Vercel projects for landing + map, and a Railway service for the API, all
   with env vars set from `destination.json`.
4. A printed **content checklist**: "beaches.csv needs name, lat, lng, access,
   facilities… — 0 rows so far."

Then the only remaining work per destination is **filling in CSVs**, which is the
part you can genuinely do from a café in the destination itself with a phone and
a notebook. That is the working-while-traveling model, made concrete: the
software is done; the job is fieldwork.

Corollary: invest in the data pipeline as seriously as the app. You already have
the raw shape of it in [data/](data/) and [db/scripts/](db/scripts/)
(`import_beaches.py`, `extract_coords.py`, `resolve_tripadvisor_ids.mjs`,
`sync_tripadvisor_coords.mjs`). Generalize those into `tools/` as
destination-parameterized commands. **The moat is not the app — anyone can build
a map app. The moat is 200 hand-verified beach entries with real 4×4 access
notes, and the tooling that makes collecting the next 200 fast.**

---

## 8. Sequenced plan

### Phase 0 — Finish destination #1 (do not skip)
Multi-destination work is worthless if #1 doesn't convert. From your notes, still
open: production deploy of the API and map app (`api.` and `app.` subdomains),
key rotation, and the tablet layout. **Prove one destination makes money before
templating.** A template of an unvalidated product is a faster way to be wrong.

Exit criterion: real, paying, non-friend users on Vieques.

### Phase 1 — Extract the config seam (~2 weeks, no new destination yet)
Refactor in place, Vieques as the only destination. Success = `git grep -i
vieques apps/ packages/` returns nothing.

1. Monorepo restructure (`apps/`, `packages/`, `destinations/`).
2. `packages/config` + zod schema + `destinations/vieques/destination.json`.
3. Inject config into map app (center/zoom/categories/brand), API (weather/prompt/
   routing), landing (copy files + brand).
4. Generated AI tool descriptions (§6.3).
5. Ship it. Vieques must look and behave identically. That's the test.

### Phase 2 — Modularize schema + build the scaffolder (~2 weeks)
6. Squash migrations; split core-db vs modules vs seed CSVs.
7. `tools/seed.mjs` and `tools/new-destination.mjs`.
8. **Validate by rebuilding Vieques' database from scratch with the tooling.**
   If `new-destination vieques` + seed CSVs reproduces today's production data,
   the template works. If it doesn't, you learn that now instead of at 2am
   during a launch.

### Phase 3 — Culebra (the cheap proof)
Culebra needs **zero new modules** (§5). Same island geography, same content
types, ~1/3 the data volume, and shares Vieques' ferry-and-day-trip traveler —
you can cross-sell to an audience you already have. Target: config + data only,
one week, no application code changes. If Culebra requires code changes, the
abstraction is wrong and Phase 2 isn't done.

### Phase 4 — Old San Juan (the real test)
Different `kind`. Needs `historic-sites`, `nightlife`, `shopping`, `walking-tours`
modules; `foot` routing; `zoom: 15`; Spanish locale; a cruise-pier default
origin. This is where you find out whether the module contract holds. Budget
2–3 weeks and expect the contract to need one revision. Bigger market, more
competition — but if the template survives OSJ, it survives anything in the
Caribbean.

### Phase 5 — Platform economics
- **Puerto Rico pass** — one purchase, all PR destinations. Requires cross-
  destination entitlement: a shared identity Supabase project, or destination
  scope on the subscription row. This is the moment Option B (§2) becomes
  worth revisiting.
- **Business listings self-serve** — the recurring-revenue side of
  [plans.js](landing/src/lib/plans.js), already fully specced, still unbuilt.
  It's the difference between selling $14 passes to tourists and $59/mo to
  operators. At N destinations it's the same product sold N times.
- **Destination admin CMS** — so you can hire a local to maintain content
  instead of editing CSVs yourself. This is what removes *you* from the loop and
  makes it a business rather than a job.

---

## 9. Decisions to make now (they're cheap now, expensive later)

1. **One Stripe account, `destination` in metadata** — yes. Splitting per
   destination means N dashboards, N webhook endpoints, N tax registrations.
2. **One Supabase project per destination for content; consider one shared for
   identity.** Isolation for data, unity for users. Decide before Phase 3 —
   retrofitting shared identity after two destinations have separate `auth.users`
   means an account migration.
3. **Domain strategy.** Per-destination domains (`exploreoldsanjuan.com`) are
   better for SEO and local trust; subdomains of one brand
   (`oldsanjuan.travelai.com`) are cheaper and build a parent brand. Recommend:
   per-destination domains for the landing pages, one shared parent brand for the
   company. Buy the domains for your top 6 targets now — they're $12 and it
   forecloses the annoying version of this problem.
4. **Naming the company/platform** — "Vieques AI" cannot be the parent. The
   monorepo, the npm scope, and the shared brand need a name that isn't a place.
   Pick it before the monorepo restructure so you rename once.
5. **Where the AI model spend lands.** Currently one cheap Gemini model for chat,
   Claude for itineraries. At N destinations the free-tier AI grant (0023) is N
   times the cost. Model that before launch #3.

---

## 10. What to be honest with yourself about

- **The app is not the hard part.** Content is. Vieques took months mostly
  because someone had to know which beaches need 4×4. That cost does not shrink
  with a better template — only the *code* cost does. Plan for 2–4 weeks of
  fieldwork per destination regardless, and build tooling that makes fieldwork
  fast (mobile capture form → CSV → seed) as seriously as you build features.
- **Old San Juan has competition Vieques doesn't.** Vieques is underserved,
  which is why the app can win. OSJ has TripAdvisor, Google Maps, a dozen
  walking-tour apps, and real budgets. Your edge there has to be curation and
  the AI, not existence. Consider more Vieques-like markets (Rincón, Isabela,
  Cabo Rojo, other small Caribbean islands) before the big ones — that's where
  the template's economics actually shine.
- **Don't build Phase 5 features during Phase 1.** The temptation to add the
  itinerary builder while refactoring is strong and it will double the timeline.
  The refactor's only job is to produce an identical Vieques with no hardcoded
  strings.
- **The template is only proven when it's used twice.** Everything in this doc is
  a hypothesis until Culebra ships without touching `apps/`.

---

## Appendix A — File-by-file de-Vieques checklist

Run `git grep -niE 'vieques|18\.1[0-9]|-65\.4'` after Phase 1; this should be the
complete set that comes back clean:

- [ ] [frontend/src/components/MapView.tsx](frontend/src/components/MapView.tsx) — `VIEQUES_CENTER` (L65, L352, L1390), zoom L353, directions origin L903, header fallbacks L1226/L1274, attribution L1407
- [ ] [frontend/src/lib/place.ts](frontend/src/lib/place.ts) — `CATEGORIES` L171
- [ ] [frontend/src/hooks/useWeather.ts](frontend/src/hooks/useWeather.ts)
- [ ] [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
- [ ] [frontend/src/components/AiChatBody.tsx](frontend/src/components/AiChatBody.tsx)
- [ ] [frontend/src/index.css](frontend/src/index.css), [frontend/index.html](frontend/index.html)
- [ ] [backend/server.js](backend/server.js) — `SYSTEM_PROMPT` L935, `VIEQUES_COORDS` L1134, timezone, DB name fallbacks L102–103
- [ ] [backend/aiTools.js](backend/aiTools.js) — all five tool descriptions (L28, 58, 85, 120, 144)
- [ ] [landing/src/pages/Home.jsx](landing/src/pages/Home.jsx) (10), NavBar, SignUp, LogIn, Pricing, Account
- [ ] [landing/public/styles.css](landing/public/styles.css), [landing/index.html](landing/index.html), [landing/src/lib/mapApp.js](landing/src/lib/mapApp.js)
- [ ] [cli/vqctl.js](cli/vqctl.js) — rename to a destination-parameterized tool
- [ ] All `.env.example` files — replace domain literals with `<slug>` placeholders

## Appendix B — Module contract (the interface every content type implements)

```jsonc
// packages/modules/<slug>/module.json
{
  "slug": "historic-sites",
  "label": "Historic Sites",           // default; destination.json may override
  "placeKind": "historic",             // extends PlaceKind union in place.ts
  "tables": ["historic_sites", "historic_site_categories"],
  "tierFeature": "historic_sites",     // consumed by requireTier()
  "endpoints": ["/api/historic-sites", "/api/historic-sites/:slug"],
  "aiTool": "search_historic_sites",
  "geometry": "point",                 // point | line | polygon
  "seed": {
    "file": "historic_sites.csv",
    "columns": ["name","latitude","longitude","era","admission","hours","description"],
    "required": ["name","latitude","longitude"]
  }
}
```

Adding a content type = one folder implementing this. Adding a destination =
one config file + CSVs. That's the whole company.
