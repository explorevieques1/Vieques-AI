-- 0004_snorkeling.sql
-- Self-guided snorkeling: spots tied to a beach, each with proximity zones
-- (polygons) marking hazards, wildlife areas, recommended routes, etc.

-- A snorkeling spot — usually anchored to/near a beach.
CREATE TABLE IF NOT EXISTS snorkel_spots (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  beach_id      bigint REFERENCES beaches(id) ON DELETE SET NULL,
  description   text,
  difficulty    text,                         -- e.g. beginner / intermediate / advanced
  entry_notes   text,                         -- how/where to enter the water
  latitude      double precision,             -- map focus point for the spot
  longitude     double precision,
  geom          geography(Point, 4326),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A proximity zone = one polygon within a spot.
-- zone_type drives the color/meaning; we also store an explicit color + label.
CREATE TABLE IF NOT EXISTS snorkel_zones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  spot_id       bigint NOT NULL REFERENCES snorkel_spots(id) ON DELETE CASCADE,
  label         text,                         -- "AVOID", "turtles", "reef", ...
  zone_type     text NOT NULL DEFAULT 'info', -- 'hazard' | 'wildlife' | 'recommended' | 'info'
  color         text,                         -- hex; overrides the type default if set
  description   text,
  area          geography(Polygon, 4326) NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snorkel_spots_geom ON snorkel_spots USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_snorkel_zones_area ON snorkel_zones USING gist (area);
CREATE INDEX IF NOT EXISTS idx_snorkel_zones_spot ON snorkel_zones (spot_id);

-- keep the spot's point geom synced from lat/lng
CREATE OR REPLACE FUNCTION snorkel_spots_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snorkel_spots_geom ON snorkel_spots;
CREATE TRIGGER trg_snorkel_spots_geom
  BEFORE INSERT OR UPDATE ON snorkel_spots
  FOR EACH ROW EXECUTE FUNCTION snorkel_spots_set_geom();
