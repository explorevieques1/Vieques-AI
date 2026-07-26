-- ============================================================================
--  0029_restaurant_tripadvisor.sql — Tripadvisor join key for restaurants
-- ============================================================================
--
--  0027_stays.sql gave stay_listings a `tripadvisor_location_id` and a shared
--  `tripadvisor_cache`. This is the same column on restaurant_listings, so the
--  one proxy route in server.js (tripadvisorRoute()) serves both tables.
--
--  NO NEW CACHE TABLE. `tripadvisor_cache` is keyed by Tripadvisor's
--  location_id, not by our listing id, precisely so a second table pointing at
--  the Content API reuses it. El Blok is the case that proves the point: the
--  hotel is a stay and its restaurant is a separate listing, two rows in two
--  tables — but each resolves to its own location_id, so neither collides and
--  both share one TTL and one call budget.
--
--  NULLABLE, AND MOST ROWS WILL STAY NULL. Of the 35 restaurants on the island
--  a good number are food trucks, bakeries and kiosks with no Tripadvisor
--  listing at all. A NULL renders the panel without the Tripadvisor block,
--  which is a supported state — see the 204 branch in tripadvisorRoute().
--
--  Ids are resolved by db/scripts/resolve_tripadvisor_ids.mjs --restaurants
--  and confirmed by hand before they land here. Only El Quenepo is seeded:
--  its id came off the Tripadvisor URL directly (…-d776130-…), so it needed no
--  fuzzy match. Everything else goes through the script, because
--  /location/search silently returns a plausible-looking wrong restaurant
--  rather than nothing.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

ALTER TABLE public.restaurant_listings
  ADD COLUMN IF NOT EXISTS tripadvisor_location_id text;

-- Partial index: the column is NULL for most rows and is only ever looked up
-- when present, so indexing the NULLs would be dead weight.
CREATE INDEX IF NOT EXISTS idx_restaurant_listings_tripadvisor
  ON public.restaurant_listings (tripadvisor_location_id)
  WHERE tripadvisor_location_id IS NOT NULL;

-- Seeded from the listing URL, not from a search:
-- tripadvisor.com/Restaurant_Review-g2091641-d776130-Reviews-El_Quenepo-…
UPDATE public.restaurant_listings
   SET tripadvisor_location_id = '776130'
 WHERE name = 'El Quenepo'
   AND tripadvisor_location_id IS DISTINCT FROM '776130';

COMMIT;
