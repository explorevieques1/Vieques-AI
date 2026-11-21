-- ============================================================================
--  0058_import_trails_tolerance.sql — let a caller choose the simplify tolerance
-- ============================================================================
--
--  import_trails() (0026) always simplified at 0.00001° (~1.1 m). That is right
--  for a hand-drawn or noisy OSM line, but the USFWS Vieques trail survey is
--  resource-grade GPS (50 cm – 1 m), so a fixed 1 m tolerance threw away ~85%
--  of its real vertices (Cerro Playuela: 261 → 42 points).
--
--  The FeatureCollection may now carry an optional top-level `simplify_deg`
--  number. Absent → the old 0.00001, so every existing caller behaves exactly
--  as before. The survey import passes 0.000002 (~0.2 m, below the GPS error),
--  which still removes redundant collinear points but keeps the curves.
--
--  Nothing else changes: same cleanup order, same upsert, same privileges.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.import_trails(fc jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  feat      jsonb;
  props     jsonb;
  g         geometry;
  written   integer := 0;
  tol       double precision := COALESCE((fc->>'simplify_deg')::double precision, 0.00001);
BEGIN
  IF fc->>'type' IS DISTINCT FROM 'FeatureCollection' THEN
    RAISE EXCEPTION 'import_trails expects a FeatureCollection, got %', fc->>'type';
  END IF;

  IF tol < 0 OR tol > 0.0001 THEN
    RAISE EXCEPTION 'simplify_deg % out of range (0 .. 0.0001, ~11 m)', tol;
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

    g := ST_SimplifyPreserveTopology(
           ST_RemoveRepeatedPoints(
             ST_SnapToGrid(
               ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326),
               0.000001)),
           tol);

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

REVOKE ALL ON FUNCTION public.import_trails(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.import_trails(jsonb) FROM anon, authenticated;

COMMIT;
