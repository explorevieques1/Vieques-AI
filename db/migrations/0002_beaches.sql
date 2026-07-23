-- 0002_beaches.sql
-- Beaches table for the Beaches tab. One row per beach.

CREATE TABLE IF NOT EXISTS beaches (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              text NOT NULL,
  local_name        text,
  latitude          double precision NOT NULL,
  longitude         double precision NOT NULL,
  geom              geography(Point, 4326),
  region            text,
  type              text[]  NOT NULL DEFAULT '{}',   -- split from comma list on import
  water_conditions  text,
  access            text,
  facilities        text[]  NOT NULL DEFAULT '{}',   -- split from comma list on import
  best_for          text,
  in_wildlife_refuge boolean NOT NULL DEFAULT false,
  gate_hours        text,
  notes             text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beaches_geom ON beaches USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_beaches_name_trgm ON beaches USING gin (name gin_trgm_ops);

-- keep geom in sync with lat/lng automatically
CREATE OR REPLACE FUNCTION beaches_set_geom() RETURNS trigger AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_beaches_geom ON beaches;
CREATE TRIGGER trg_beaches_geom
  BEFORE INSERT OR UPDATE ON beaches
  FOR EACH ROW EXECUTE FUNCTION beaches_set_geom();
