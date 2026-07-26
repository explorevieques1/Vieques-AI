-- ============================================================================
--  0027_stays.sql — lodging listings + the Tripadvisor response cache
-- ============================================================================
--
--  Until now `stays` was a dead pill in the map app: frontend/src/lib/place.ts
--  carried `comingSoon: true` with the comment "No `stays` table or endpoint
--  exists yet". This is that table.
--
--  SHAPE
--  -----
--  A plain POINT listing, so it copies 0013_restaurants.sql almost exactly —
--  same identity PK, same geography(Point,4326) + has_location + BEFORE trigger
--  that derives both from lat/lng, same gist + trigram indexes, same RLS policy
--  from 0019_gate_content_rls.sql. The lodging-specific columns (sleeps, price
--  band, check-in/out, amenities) are the only real difference.
--
--  NO CATEGORY JOIN TABLE. Restaurants/services/essentials each have a
--  {x}_categories + {x}_listing_categories pair because their sidebar needs a
--  chip row. Stays do not: `property_type` already carries the same
--  distinction on every row, and there are ~6 listings island-wide, so they
--  load in one shot like beaches do (place.ts keeps hasSubcategories: false).
--  Promoting property_type to a chip row later is a categories endpoint plus
--  one flag — cheaper than maintaining a join table nobody queries.
--
--  TRIPADVISOR
--  -----------
--  `tripadvisor_location_id` is the join key to the Content API, resolved
--  once per property by db/scripts/resolve_tripadvisor_ids.mjs and reviewed by
--  hand before it lands here. It is deliberately nullable: not every property
--  has a Tripadvisor listing (a villa-rental collective generally does not),
--  and a NULL that renders no panel beats a wrong id that renders someone
--  else's reviews. It is never sent to the browser — see GET /api/stays.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
--  Listings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stay_listings (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                    text NOT NULL,
  local_name              text,
  description             text,

  -- --- what kind of place it is --------------------------------------------
  property_type           text,          -- boutique hotel | eco hotel | guest house | hostel | villa
  sleeps                  int,
  bedrooms                int,
  bathrooms               numeric,       -- numeric: half-baths are real (2.5)
  unit_count              int,           -- rooms/units in the property, NULL for a rental collective

  -- --- money ---------------------------------------------------------------
  -- price_band is the $/$$/$$$ pill; nightly_min/max are the real numbers.
  -- Both are kept: the band survives a stale rate, the numbers answer "can I
  -- afford it". price_note carries the seasonality caveat verbatim rather than
  -- letting a single number imply a precision the rate does not have.
  price_band              text,
  nightly_min             numeric,
  nightly_max             numeric,
  price_note              text,
  min_nights              int,
  currency                text NOT NULL DEFAULT 'USD',

  -- --- staying there -------------------------------------------------------
  check_in                text,          -- free text: "3:00 PM" is what a guest reads
  check_out               text,
  pets_allowed            boolean,       -- NULL = not known, which is not the same as false
  accessible              boolean,
  amenities               text[] NOT NULL DEFAULT '{}',

  -- --- contact -------------------------------------------------------------
  phones                  text[] NOT NULL DEFAULT '{}',
  email                   text,
  website                 text,
  booking_url             text,          -- kept apart from `website`: one is the
                                         -- brochure, one is the CTA
  hours                   text,

  images                  text[] NOT NULL DEFAULT '{}',
  image_credit            text,

  -- --- where ---------------------------------------------------------------
  latitude                double precision,
  longitude               double precision,
  geom                    geography(Point, 4326),
  has_location            boolean NOT NULL DEFAULT false,
  address                 text,
  location_area           text,
  location_precision      text,          -- exact | approximate
  directions_note         text,

  -- --- external ------------------------------------------------------------
  tripadvisor_location_id text,

  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Seeds and re-imports upsert on the name, so re-running this file updates a
-- property instead of duplicating it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stay_listings_name ON public.stay_listings (name);
CREATE INDEX IF NOT EXISTS idx_stay_listings_geom ON public.stay_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_stay_listings_name_trgm
  ON public.stay_listings USING gin (name gin_trgm_ops);

-- `SET search_path = public, extensions` for the reason spelled out in
-- 0026_trails_import_and_seed.sql: Supabase installs PostGIS into `extensions`,
-- not public, so a function pinned to public alone cannot see ST_MakePoint or
-- even the `geography` type. Listing a schema that does not exist is harmless,
-- so the same line also works on a local Postgres with PostGIS in public.
CREATE OR REPLACE FUNCTION public.stay_listings_set_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stay_listings_geom ON public.stay_listings;
CREATE TRIGGER trg_stay_listings_geom
  BEFORE INSERT OR UPDATE ON public.stay_listings
  FOR EACH ROW EXECUTE FUNCTION public.stay_listings_set_geom();

-- ---------------------------------------------------------------------------
--  Tripadvisor response cache
-- ---------------------------------------------------------------------------
--  The first cache of any kind in this codebase, and deliberately the smallest
--  thing that works: one table, no Redis, no eviction job.
--
--  Two jobs, and the second is the important one:
--    1. Stay under the Content API's call budget — a panel reopened five times
--       is one upstream call, and Tripadvisor's licence only permits
--       short-term caching anyway, hence the 24h TTL the route applies.
--    2. Survive an upstream failure. On a non-200 from Tripadvisor the route
--       falls back to the stale row rather than blanking the panel: a
--       day-old rating is worth more to a traveller than an error state.
--
--  Keyed by location_id rather than by our stay id so the cache stays useful
--  if a second table ever points at the same Tripadvisor listing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tripadvisor_cache (
  location_id text PRIMARY KEY,
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  RLS — identical policy to the 19 tables in 0019_gate_content_rls.sql.
--  The backend pool connects as the table owner and bypasses this; it only
--  constrains anon/authenticated hitting PostgREST directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stay_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entitled read" ON public.stay_listings;
CREATE POLICY "entitled read" ON public.stay_listings
  FOR SELECT TO authenticated
  USING (public.has_active_entitlement());

-- The cache holds third-party content keyed to nothing user-specific, but it
-- is served exclusively through the API. No policy at all = default-deny for
-- anon/authenticated, backend unaffected.
ALTER TABLE public.tripadvisor_cache ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
--  Seed — the 6 properties from vieques_stays.csv
-- ---------------------------------------------------------------------------
--  Unlike the restaurant categories in 0013 these ARE listing data, but the
--  set is small, hand-verified and island-complete, so it lives in the
--  migration rather than in a one-off import script that would then need
--  keeping alongside it.
-- ---------------------------------------------------------------------------
INSERT INTO public.stay_listings (
  name, description, property_type, sleeps, bedrooms, bathrooms, unit_count,
  price_band, nightly_min, nightly_max, price_note, min_nights, currency,
  check_in, check_out, pets_allowed, accessible, amenities, phones,
  website, booking_url, latitude, longitude, address, location_area,
  location_precision, directions_note
) VALUES
  (
    'Malecón House',
    'Boutique guesthouse on the Esperanza waterfront with rooftop terrace and sea views, walking distance to the malecón restaurants.',
    'boutique hotel', 2, 1, 1, 13,
    '$$$', 185, 340, 'Rates higher in winter high season', 2, 'USD',
    '3:00 PM', '11:00 AM', NULL, NULL,
    '{wifi,air_conditioning,pool,breakfast,terrace,ocean_view}', '{+1-787-741-0663}',
    'https://maleconhouse.com', 'https://maleconhouse.com',
    18.0938, -65.4712, 'Calle Flamboyan, Esperanza', 'Esperanza', 'exact', NULL
  ),
  (
    'Hix Island House',
    'Off-grid solar eco-hotel of poured-concrete lofts set in 13 acres of hillside, each unit open-air with an outdoor shower.',
    'eco hotel', 2, 1, 1, 19,
    '$$$', 215, 395, '3-night minimum in high season', 2, 'USD',
    '3:00 PM', '11:00 AM', false, NULL,
    '{wifi,pool,solar,yoga,kitchen,breakfast}', '{+1-787-741-2302}',
    'https://hixislandhouse.com', 'https://hixislandhouse.com',
    18.1246, -65.4389, 'Carr. 995 Km 1.5', 'Barrio Florida', 'approximate',
    'On Route 995, gravel entrance road'
  ),
  (
    'El Blok',
    'Architecturally striking concrete boutique hotel on the Esperanza waterfront with a rooftop pool and ground-floor restaurant.',
    'boutique hotel', 2, 1, 1, 22,
    '$$$', 205, 375, NULL, 2, 'USD',
    '3:00 PM', '11:00 AM', false, true,
    '{wifi,air_conditioning,pool,restaurant,bar,ocean_view}', '{+1-787-741-6020}',
    'https://elblok.com', 'https://elblok.com',
    18.0942, -65.4728, 'Calle Flamboyan 158, Esperanza', 'Esperanza', 'exact', NULL
  ),
  (
    'Casa de Amistad',
    'Small friendly guesthouse in Isabel Segunda with a plunge pool, a short walk from the ferry terminal and town shops.',
    'guest house', 2, 1, 1, 10,
    '$$', 110, 175, NULL, 2, 'USD',
    '2:00 PM', '11:00 AM', NULL, NULL,
    '{wifi,air_conditioning,pool,kitchenette}', '{+1-787-741-3758}',
    'https://casadeamistad.com', 'https://casadeamistad.com',
    18.1497, -65.4436, 'Calle Benitez Castaño 27, Isabel Segunda', 'Isabel Segunda',
    'exact', NULL
  ),
  (
    'The Lazy Hostel',
    'Relaxed budget hostel a block from the Esperanza waterfront with private rooms and shared common areas.',
    'hostel', 2, 1, 1, 8,
    '$', 75, 130, NULL, 1, 'USD',
    '3:00 PM', '10:00 AM', NULL, NULL,
    '{wifi,air_conditioning,shared_kitchen}', '{+1-787-435-2124}',
    'https://lazyhostelvieques.com', 'https://lazyhostelvieques.com',
    18.0951, -65.4698, 'Calle Almendro, Esperanza', 'Esperanza', 'approximate', NULL
  ),
  (
    'Bravos Boyz Villa Rentals',
    'Collection of private hillside and beach-area vacation villas across Vieques, most with private pools and full kitchens.',
    'villa', 8, 4, 3.0, NULL,
    '$$$', 250, 650, 'Weekly bookings preferred, rates vary by villa and season', 3, 'USD',
    '4:00 PM', '10:00 AM', NULL, NULL,
    '{wifi,air_conditioning,pool,kitchen,parking}', '{}',
    NULL, NULL,
    18.1265, -65.4402, NULL, 'Monte Santo', 'approximate',
    'Individual villas across the island; location varies by unit'
  )
ON CONFLICT (name) DO NOTHING;

COMMIT;
