-- ============================================================================
--  0025_trails.sql — hiking trails (PostGIS LineStrings)
-- ============================================================================
--
--  WHY THIS TABLE IS SHAPED DIFFERENTLY FROM THE OTHER CONTENT TABLES
--  ------------------------------------------------------------------
--  Every other map table (beaches, *_listings, snorkel_spots) is a POINT: one
--  lat/lng, one pin. A trail is a LINE — an ordered run of [lng,lat] vertices —
--  so it gets a real `geometry(LineString,4326)` column and renders as a
--  polyline layer rather than a marker. See data/docs/hiking.md.
--
--  Two rules this schema enforces that the doc calls out but a plain column
--  list cannot:
--
--   1. LENGTH IS DERIVED, NEVER TYPED IN. hiking.md §"Data cleanup pipeline"
--      step 4: "Compute length via haversine — don't trust metadata fields."
--      The USFWS `MILES` field lags reality (2012 inventory) and OSM has no
--      length at all, so `distance_km` is a GENERATED column over
--      ST_Length(geom::geography) — geodesic, in metres, on the WGS84 spheroid.
--      It cannot drift from the geometry because Postgres recomputes it on
--      every write. `distance_mi` is the same number in the unit the FWS trail
--      page and the UI both use.
--
--      (`published_distance_mi` exists separately for the number FWS *prints*,
--      so a mismatch between the printed length and the drawn line stays
--      visible instead of one silently overwriting the other.)
--
--   2. THE TRAILHEAD IS DERIVED TOO. It is ST_StartPoint(geom) — no
--      hand-entered trailhead columns to fall out of sync when the line is
--      re-imported. The API exposes it as trailhead_lat/lng so the map app can
--      drop a pin, sort by distance-from-you, and route to it.
--
--  Gating: hiking is part of the `activities` feature bundle (backend/
--  payments.js → FEATURES), i.e. included from Day Trip up. RLS below mirrors
--  0019_gate_content_rls.sql so a direct PostgREST call with the anon key gets
--  zero rows even if someone bypasses the Express API.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.trails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable human key. Seeds and re-imports upsert on this, so re-running a
  -- load script updates the trail instead of duplicating it.
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  local_name            text,

  -- --- what the info pane shows -------------------------------------------
  difficulty            text CHECK (difficulty IN ('easy', 'moderate', 'hard')),
  surface               text,          -- native | boardwalk | gravel | sand | paved
  route_type            text CHECK (route_type IN ('out_and_back', 'loop', 'point_to_point')),
  elevation_gain_m      numeric,
  est_minutes           integer,       -- NULL → the client estimates from distance
  region                text,
  best_time             text,          -- 'Early morning — no shade after 10am'
  shade                 text,          -- 'none' | 'partial' | 'full'
  dogs_allowed          boolean,

  -- --- refuge rules (same pattern as beaches.in_wildlife_refuge) -----------
  in_wildlife_refuge    boolean NOT NULL DEFAULT false,
  gate_hours            text,
  warning               text,          -- amber callout in PlaceDetailPanel

  description           text,

  -- --- provenance ----------------------------------------------------------
  source                text,          -- 'USFWS' | 'OSM' | 'geojson_import'
  source_url            text,
  -- The length the source *publishes*, kept apart from the measured one.
  published_distance_mi numeric,

  is_active             boolean NOT NULL DEFAULT true,

  geom                  geometry(LineString, 4326) NOT NULL,

  -- Measured, never stale. STORED so it is indexable and sortable.
  distance_km numeric GENERATED ALWAYS AS (
    round((ST_Length(geom::geography) / 1000)::numeric, 3)
  ) STORED,
  distance_mi numeric GENERATED ALWAYS AS (
    round((ST_Length(geom::geography) / 1609.344)::numeric, 2)
  ) STORED,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trails_geom_idx ON public.trails USING gist (geom);
CREATE INDEX IF NOT EXISTS trails_active_idx ON public.trails (is_active) WHERE is_active;

COMMENT ON COLUMN public.trails.distance_km IS
  'Geodesic length measured from geom. Generated — do not write to it.';
COMMENT ON COLUMN public.trails.published_distance_mi IS
  'Length as printed by the source (e.g. the FWS trails page). Compare against distance_mi to spot stale source geometry.';

-- ---------------------------------------------------------------------------
--  RLS — identical policy to the 19 tables in 0019_gate_content_rls.sql.
--  The backend pool connects as the table owner and bypasses this; it only
--  constrains anon/authenticated hitting PostgREST directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entitled read" ON public.trails;
CREATE POLICY "entitled read" ON public.trails
  FOR SELECT TO authenticated
  USING (public.has_active_entitlement());

COMMIT;
