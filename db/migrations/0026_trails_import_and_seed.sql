-- ============================================================================
--  0026_trails_import_and_seed.sql — the GeoJSON loader + the first trail
-- ============================================================================
--
--  Part 1 builds `public.import_trails(jsonb)`, which takes a whole GeoJSON
--  FeatureCollection and upserts every LineString in it. This is the second of
--  the two options hiking.md §"Loading into Supabase" describes ("send the
--  whole FeatureCollection to a Postgres function that iterates and inserts"),
--  and it is the better one: the cleanup pipeline then lives in ONE place that
--  every future import goes through — the FWS bulk pull, an Overpass export, or
--  a single line drawn by hand in geojson.io — instead of being re-implemented
--  per script.
--
--  The cleanup steps are hiking.md §"Data cleanup pipeline" 1-3, done with
--  PostGIS rather than shapely so there is no Python dependency in the load
--  path and the same code runs against Supabase directly:
--
--      1. round to 6 decimals   → ST_SnapToGrid(g, 0.000001)      (~11 cm)
--      2. dedupe repeated points→ ST_RemoveRepeatedPoints(g)
--      3. Douglas-Peucker       → ST_SimplifyPreserveTopology(g, 0.00001) (~1 m)
--      4. compute length        → the generated columns in 0025 (geodesic)
--
--  On the seed trail that is 30 vertices → 27, and 623.2 m → 623.1 m: the
--  noise goes, the shape does not.
--
--  Part 2 seeds the one trail we have geometry for. Idempotent — the upsert is
--  on `slug`, so re-running refreshes rather than duplicates.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  Part 1 — the importer
-- ---------------------------------------------------------------------------
--  Each feature's `properties` map onto trails columns by name. Only `slug`
--  and `name` are required; everything else is optional and defaults to NULL,
--  which is what raw OSM features (empty `properties`) produce. Unknown keys
--  are ignored, so an untouched FWS feature carrying TRLNAME/MILES/etc. can be
--  passed straight in and enriched later.
--
--  A feature whose geometry is not a LineString is skipped rather than fatal —
--  an Overpass export routinely mixes in Points and MultiLineStrings, and one
--  of those should not abort a 40-trail load. The function returns how many
--  rows it actually wrote so the caller can compare against the feature count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_trails(fc jsonb)
RETURNS integer
LANGUAGE plpgsql
-- `extensions` is where Supabase installs PostGIS (it is NOT in public). A
-- function that pins search_path to public alone cannot see ST_SnapToGrid or
-- even the `geometry` type, and fails at CREATE time with
-- `type "geometry" does not exist`. Listing a schema that doesn't exist is
-- harmless, so this is still correct against a local Postgres where PostGIS
-- was installed into public.
SET search_path = public, extensions
AS $$
DECLARE
  feat      jsonb;
  props     jsonb;
  g         geometry;
  written   integer := 0;
BEGIN
  IF fc->>'type' IS DISTINCT FROM 'FeatureCollection' THEN
    RAISE EXCEPTION 'import_trails expects a FeatureCollection, got %', fc->>'type';
  END IF;

  FOR feat IN SELECT * FROM jsonb_array_elements(fc->'features')
  LOOP
    props := COALESCE(feat->'properties', '{}'::jsonb);

    IF feat->'geometry'->>'type' IS DISTINCT FROM 'LineString' THEN
      RAISE NOTICE 'skipping non-LineString feature (%)', feat->'geometry'->>'type';
      CONTINUE;
    END IF;

    IF props->>'slug' IS NULL OR props->>'name' IS NULL THEN
      RAISE EXCEPTION 'every feature needs properties.slug and properties.name; got %', props;
    END IF;

    -- Steps 1-3 of the cleanup pipeline.
    g := ST_SimplifyPreserveTopology(
           ST_RemoveRepeatedPoints(
             ST_SnapToGrid(
               ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326),
               0.000001)),
           0.00001);

    -- Simplification can collapse a degenerate line to a point. Skip it rather
    -- than let the geometry(LineString) cast raise on the insert.
    IF ST_NPoints(g) < 2 THEN
      RAISE NOTICE 'skipping degenerate trail %', props->>'slug';
      CONTINUE;
    END IF;

    INSERT INTO public.trails (
      slug, name, local_name, difficulty, surface, route_type,
      elevation_gain_m, est_minutes, region, best_time, shade, dogs_allowed,
      in_wildlife_refuge, gate_hours, warning, description,
      source, source_url, published_distance_mi, is_active, geom
    )
    VALUES (
      props->>'slug',
      props->>'name',
      props->>'local_name',
      props->>'difficulty',
      props->>'surface',
      props->>'route_type',
      (props->>'elevation_gain_m')::numeric,
      (props->>'est_minutes')::integer,
      props->>'region',
      props->>'best_time',
      props->>'shade',
      (props->>'dogs_allowed')::boolean,
      COALESCE((props->>'in_wildlife_refuge')::boolean, false),
      props->>'gate_hours',
      props->>'warning',
      props->>'description',
      props->>'source',
      props->>'source_url',
      (props->>'published_distance_mi')::numeric,
      COALESCE((props->>'is_active')::boolean, true),
      g::geometry(LineString, 4326)
    )
    ON CONFLICT (slug) DO UPDATE SET
      name                  = EXCLUDED.name,
      local_name            = EXCLUDED.local_name,
      difficulty            = EXCLUDED.difficulty,
      surface               = EXCLUDED.surface,
      route_type            = EXCLUDED.route_type,
      elevation_gain_m      = EXCLUDED.elevation_gain_m,
      est_minutes           = EXCLUDED.est_minutes,
      region                = EXCLUDED.region,
      best_time             = EXCLUDED.best_time,
      shade                 = EXCLUDED.shade,
      dogs_allowed          = EXCLUDED.dogs_allowed,
      in_wildlife_refuge    = EXCLUDED.in_wildlife_refuge,
      gate_hours            = EXCLUDED.gate_hours,
      warning               = EXCLUDED.warning,
      description           = EXCLUDED.description,
      source                = EXCLUDED.source,
      source_url            = EXCLUDED.source_url,
      published_distance_mi = EXCLUDED.published_distance_mi,
      is_active             = EXCLUDED.is_active,
      geom                  = EXCLUDED.geom,
      updated_at            = now();

    written := written + 1;
  END LOOP;

  RETURN written;
END;
$$;

-- This is a load-time admin tool, not part of the read API. The backend pool
-- connects as the owner and can call it; nobody holding the anon key can.
REVOKE ALL ON FUNCTION public.import_trails(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.import_trails(jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
--  Part 2 — seed: Puerto Ferro Lighthouse trail
-- ---------------------------------------------------------------------------
--  Geometry is the hand-drawn test line (data/trails/puerto-ferro-lighthouse.geojson).
--  It runs south from the refuge road at 18.1056,-65.4185, past the Faro de
--  Puerto Ferro headland, ending 18.1026,-65.4173 — 623 m / 0.39 mi measured,
--  start and end 349 m apart, so it is point-to-point, not a loop.
--
--  ⚠ The metadata below is a best-effort first pass, NOT authoritative. The FWS
--  trails page lists "Puerto Ferro Lighthouse" at 0.04 mi — that is the final
--  spur to the tower only, while this line includes the access track, which is
--  why published_distance_mi (0.04) and the measured distance_mi (0.39)
--  disagree by 10x. Keeping both visible is deliberate: see the column comment
--  in 0025. Replace difficulty/elevation/est_minutes once the authoritative
--  FWS FeatureCollection is pulled (hiking.md §"Open items").
-- ---------------------------------------------------------------------------
SELECT public.import_trails('{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "slug": "puerto-ferro-lighthouse",
        "name": "Puerto Ferro Lighthouse Trail",
        "local_name": "Faro de Puerto Ferro",
        "difficulty": "easy",
        "surface": "native",
        "route_type": "point_to_point",
        "elevation_gain_m": 25,
        "est_minutes": 20,
        "region": "South / Wildlife Refuge",
        "best_time": "Early morning — the headland has almost no shade after 10am",
        "shade": "none",
        "dogs_allowed": false,
        "in_wildlife_refuge": true,
        "gate_hours": "Refuge gates close at sunset",
        "warning": "The lighthouse ruin is unstable — stay outside the fence. No water, no shade, no cell service on the headland.",
        "description": "A short dirt track through dry coastal scrub out to the ruins of the Faro de Puerto Ferro, the 1896 Spanish lighthouse on the headland above Puerto Ferro. Open views over the south coast and the bioluminescent bay at the far end. Flat apart from one short rise onto the point.",
        "source": "geojson_import",
        "source_url": "https://www.fws.gov/refuge/vieques/visit-us/trails",
        "published_distance_mi": 0.04
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-65.418511,18.105553],[-65.418493,18.105479],[-65.418518,18.105397],
          [-65.418668,18.105329],[-65.41891,18.105329],[-65.419181,18.105193],
          [-65.419517,18.104895],[-65.419652,18.104678],[-65.419709,18.104578],
          [-65.419881,18.10445],[-65.419792,18.104207],[-65.419588,18.104047],
          [-65.419164,18.103964],[-65.41896,18.103966],[-65.418468,18.103776],
          [-65.418349,18.103621],[-65.418261,18.103464],[-65.418092,18.103337],
          [-65.417966,18.10333],[-65.417903,18.103318],[-65.41786,18.103272],
          [-65.417721,18.103132],[-65.417726,18.103028],[-65.417755,18.102936],
          [-65.417876,18.102799],[-65.41788,18.102702],[-65.417827,18.102618],
          [-65.417674,18.10255],[-65.417433,18.102555],[-65.417284,18.102643]
        ]
      }
    }
  ]
}'::jsonb) AS trails_written;

COMMIT;
