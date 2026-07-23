Data Layer

# Vieques Tourist App — Database Architecture Plan

## Recommended Database: PostgreSQL

For your use case, **a single PostgreSQL database** is the right choice. Here's why over the alternatives:

- **PostGIS extension** gives you native geospatial queries — essential since "where is the best beach near me" and your island map both need distance/coordinate math. This is the deciding factor.
- **`pgvector` extension** lets you store embeddings in the *same* database for semantic search (more on this below), so Claude can match "Italian food" even when a listing says "Carambola - Mediterranean & pasta."
- **JSONB columns** handle the messy, inconsistent data in your PDF (some businesses have 2 phone numbers, some have Facebook instead of a number, hours vary wildly).
- It's free, runs anywhere (Supabase, Neon, Railway, your own VPS), and scales well past what a tourist app needs.

**You do not need multiple databases.** One Postgres instance with a few extensions covers relational data, geospatial, and vector search. Adding a second database (e.g., a separate vector DB like Pinecone) introduces sync problems and cost with no benefit at your scale. Keep it simple.

---

## Data Categories (derived from your PDF)

Your PDF is essentially a flat phone directory with ~40 categories. The key architectural insight: **don't make one table per category.** Categories like "Restaurants," "Caterers," and "Bars" overlap; "Black Beard Sports" appears under Scuba, Snorkel, Kayak, Paddleboard, Biobay, and Hiking. A category-per-table design forces duplication.

Instead, model it as **one core `listings` table + a flexible category/tag system + dedicated tables only where the data shape is genuinely different** (beaches and Airbnbs have attributes a phone-directory entry doesn't).

---

## Core Schema

```
listings              ← every business/service (the PDF data)
  id, name, description, phones[], email, website,
  address, lat, lng, location_area, embedding(vector), metadata(jsonb)

categories            ← Restaurants, Scuba, Taxis, Lodging, etc.
  id, name, slug

listing_categories    ← many-to-many (Black Beard Sports → 6 categories)
  listing_id, category_id

beaches               ← richer attributes than a directory entry
  id, name, description, lat, lng, type(swimming/snorkel/biobay),
  facilities[], best_for, access_notes, embedding(vector)

accommodations        ← Airbnbs / hotels / guesthouses
  id, name, type, lat, lng, price_tier, bedrooms,
  booking_url, description, embedding(vector), metadata(jsonb)
```

A few notes on choices:
- **`phones[]` as an array** — your PDF proves single businesses have multiple numbers (Island Real Estate has 4). An array beats `phone1, phone2, phone3` columns.
- **`embedding` columns** — store a vector per listing so semantic search works. Generated once at insert/update time.
- **`metadata` JSONB** — catch-all for category-specific extras (text-only contact, "on Facebook," seasonal hours) without schema churn.

---

## How Claude Interacts With the Data

The critical design decision: **Claude should NOT write raw SQL against your database, and it should not receive your whole dataset.** Both are expensive and risky. Use a retrieval pattern:

1. **Tourist types a prompt** → "best place for Italian food"
2. **Your backend** (not Claude) embeds the query and runs a vector + keyword search in Postgres → returns the top ~10 matching listings.
3. **You pass only those 10 results** to Claude as context, with a prompt like *"Using these listings, answer the tourist's question."*
4. **Claude responds** in natural language, citing real data you control.

This is called **RAG (Retrieval-Augmented Generation)**. Benefits for your business model specifically:
- Token cost stays tiny and predictable (10 listings, not 2,000) → your credit margins stay healthy.
- Claude can't hallucinate a fake restaurant — it only sees real rows.
- You can use Claude's **tool use / function calling** so Claude itself decides to call `search_listings(query, category, near_location)` and `get_map_pins(ids)` — clean and extensible.

```
Tourist → Frontend → Your API → [embed query] → Postgres search
                                       ↓
                          top-K real listings
                                       ↓
                    Claude API (with listings as context)
                                       ↓
                          natural-language answer + map pins
```

---

## CRUD / Updating the Data

You need an **admin layer**, separate from the tourist app. Three realistic options, easiest first:

- **Supabase** — hosts your Postgres, gives you an auto-generated admin table editor, instant REST/GraphQL API, and built-in auth. For a solo builder this removes the most work. Strong recommendation for your stack.
- **A small admin dashboard** you build later (React form → API → DB) once you outgrow the table editor.
- **Bulk import script** — write a one-time Python/Node importer to parse this PDF into the `listings` table so you don't enter 300 rows by hand.

Important: **when a listing is created or updated, regenerate its embedding** in the same operation, or semantic search drifts out of sync. Wrap that in your API's create/update handlers.

---

## Modular To-Do Roadmap

**Phase 1 — Data Foundation**
- [ ] Provision Postgres (Supabase recommended) with PostGIS + pgvector enabled
- [ ] Define `listings`, `categories`, `listing_categories` tables
- [ ] Write PDF → JSON parser, clean the data (split phones, normalize categories)
- [ ] Bulk import the directory; manually geocode lat/lng for mapped entries

**Phase 2 — Beaches & Accommodations**
- [ ] Build `beaches` table; populate with Vieques beach data (Sun Bay, Caracas, Navío, Mosquito Bay, etc. — *not in your PDF, you'll source separately*)
- [ ] Build `accommodations` table; decide how Airbnb data enters (manual, or affiliate/API)

**Phase 3 — Search & Retrieval API**
- [ ] Backend endpoint: `/search` (vector + keyword + geo filter)
- [ ] Embedding generation on insert/update
- [ ] Endpoint to return map pins for a result set

**Phase 4 — Claude Integration**
- [ ] Define tool/function schema (`search_listings`, `get_beaches`, etc.)
- [ ] Wire RAG flow; tune the system prompt for a friendly local-guide tone
- [ ] Add token accounting per request (you need this for billing)

**Phase 5 — UI & Map**
- [ ] Chat interface + results cards
- [ ] Island map (Leaflet + OpenStreetMap is free; pins from your geo data)

**Phase 6 — Payments & Credits**
- [ ] Stripe integration; credit-purchase + credit-deduct-per-query logic
- [ ] User accounts, usage tracking, margin monitoring

**Phase 7 — Admin & Polish**
- [ ] Admin CRUD (start with Supabase editor)
- [ ] Rate limiting, abuse protection, analytics

---

One thing worth flagging on the business side before you build: your PDF explicitly states these are **paid advertiser listings** for viequesinsider.com. Reselling that directory's data commercially could be a rights issue — worth confirming you can use it, or sourcing/verifying the data independently, before Phase 1.

Want me to start with the **Phase 1 schema (actual SQL with PostGIS/pgvector)** or the **PDF parser** that turns this document into clean importable JSON?