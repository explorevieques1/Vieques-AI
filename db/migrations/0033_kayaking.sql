-- ============================================================================
--  0033_kayaking.sql — kayak spots + proximity zones
-- ============================================================================
--
--  Mirrors 0004_snorkeling.sql exactly. A kayak spot is a pin (put-in / launch
--  point); its zones are polygons around it marking hazards to avoid, wildlife
--  areas, and recommended routes — the same shape as snorkelling, because it is
--  the same user question: "where do I get in, and what do I stay away from?"
--
--  WHY ITS OWN TABLES RATHER THAN activity_listings
--  ------------------------------------------------
--  `kayaking` already exists as an activity_categories row (003_activities.sql,
--  sort_order 3), so the chip is already in the UI — it currently falls through
--  to the generic activity_listings fetch and returns nothing. A kayak spot is
--  not a business listing with a phone number and hours; it is a place on the
--  water with polygons attached. activity_listings has no polygon column and no
--  concept of a zone, so kayaking takes the same "this sub has its own dataset"
--  branch snorkelling and hiking take in hooks/useCategoryPlaces.ts. The
--  activity_categories row stays exactly as it is and keeps putting the chip in
--  the row; nothing joins it to a listing.
--
--  ZONE SEMANTICS
--  --------------
--  zone_type drives colour and meaning, same four values snorkelling uses:
--    'hazard'      — boat channels, surf break, strong current. Stay out.
--    'wildlife'    — manatee/turtle grass, mangrove rookery. Keep distance.
--    'recommended' — the good route.
--    'info'        — everything else.
--  `color` overrides the type default when set, so a one-off zone can be tinted
--  without inventing a new type.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Spots — the pins. beach_id is a soft link: many launches are off a beach,
--    but the mangrove and bay put-ins are not, hence nullable + SET NULL.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kayak_spots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  beach_id      bigint REFERENCES beaches(id) ON DELETE SET NULL,
  description   text,
  difficulty    text,                         -- beginner / intermediate / advanced
  entry_notes   text,                         -- where to put in, parking, carry distance
  -- Kayak-specific, no snorkel equivalent. Nullable: unknown is a real answer
  -- and a wrong guess here is worse than a blank field.
  launch_type   text,                         -- 'beach' | 'ramp' | 'dock' | 'mangrove'
  water_type    text,                         -- 'protected' | 'open' | 'mangrove' | 'bay'
  rental_nearby boolean,                      -- can you get a boat at the put-in?
  latitude      double precision,             -- map focus point for the spot
  longitude     double precision,
  geom          geography(Point, 4326),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Zones — one polygon each, cascading off the spot.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kayak_zones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spot_id       bigint NOT NULL REFERENCES kayak_spots(id) ON DELETE CASCADE,
  label         text,                         -- "AVOID", "manatees", "mangrove channel", ...
  zone_type     text NOT NULL DEFAULT 'info', -- 'hazard' | 'wildlife' | 'recommended' | 'info'
  color         text,                         -- hex; overrides the type default if set
  description   text,
  area          geography(Polygon, 4326) NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kayak_spots_geom ON kayak_spots USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_kayak_zones_area ON kayak_zones USING gist (area);
CREATE INDEX IF NOT EXISTS idx_kayak_zones_spot ON kayak_zones (spot_id);

-- ---------------------------------------------------------------------------
-- 3. Keep the spot's point geom synced from lat/lng, and touch updated_at.
--    Its own function rather than a shared one: snorkel_spots_set_geom() is
--    referenced by that table's trigger and rewriting it to be generic would
--    mean editing a live trigger's function body for no gain.
-- ---------------------------------------------------------------------------
--    `SET search_path` is pinned, which the older *_set_geom functions do not
--    do — the Supabase advisor flags every one of them with
--    function_search_path_mutable. Not copying that here: an unpinned
--    search_path on a trigger function lets a caller with CREATE on a schema
--    earlier in the path shadow ST_MakePoint. Verified after pinning that the
--    trigger still populates geom (POINT(-65.5 18.1) from a probe row).
CREATE OR REPLACE FUNCTION kayak_spots_set_geom() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kayak_spots_geom ON kayak_spots;
CREATE TRIGGER trg_kayak_spots_geom
  BEFORE INSERT OR UPDATE ON kayak_spots
  FOR EACH ROW EXECUTE FUNCTION kayak_spots_set_geom();

-- ---------------------------------------------------------------------------
-- 4. RLS — same two-layer story as 0019/0022.
--
--    Without this the tables ship with RLS disabled, which is exactly the
--    advisor finding 0019 was written to close: anyone can lift the anon key
--    out of the JS bundle and query PostgREST directly, bypassing Express.
--
--    Rank 2 (Vacation and above), matching snorkel_spots/snorkel_zones. Kayak
--    zones are the same class of content as snorkel zones — the on-water safety
--    layer that is the headline Day Trip → Vacation upsell — so they sit at the
--    same rank. If that should change, it must change in THREE places together:
--    here, FEATURES in backend/payments.js, and FEATURE_TIER in
--    frontend/src/lib/entitlement.tsx.
--
--    The backend's own reads are unaffected: server.js connects as the table
--    owner over DATABASE_URL and bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.kayak_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kayak_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tier read" ON public.kayak_spots;
DROP POLICY IF EXISTS "tier read" ON public.kayak_zones;

CREATE POLICY "tier read" ON public.kayak_spots
  FOR SELECT TO authenticated USING (public.tier_rank() >= 2);
CREATE POLICY "tier read" ON public.kayak_zones
  FOR SELECT TO authenticated USING (public.tier_rank() >= 2);

COMMENT ON TABLE public.kayak_spots IS
  'Kayak put-in points. Mirrors snorkel_spots; reached via the `kayaking` activity_categories chip.';
COMMENT ON TABLE public.kayak_zones IS
  'Polygons around a kayak spot: hazard / wildlife / recommended / info. Mirrors snorkel_zones.';

COMMIT;
