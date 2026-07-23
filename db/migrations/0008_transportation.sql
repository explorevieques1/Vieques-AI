-- 0008_transportation.sql
-- Transportation: sub-categories (taxis, car rental, airlines, ferry, ...) and
-- their listings. Same pattern as services; has_location marks mappable places.

CREATE TABLE IF NOT EXISTS transport_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_listings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  phones        text[] NOT NULL DEFAULT '{}',
  email         text,
  website       text,
  address       text,
  location_area text,
  latitude      double precision,
  longitude     double precision,
  geom          geography(Point, 4326),
  has_location  boolean NOT NULL DEFAULT false,
  hours         text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_listing_categories (
  listing_id  bigint NOT NULL REFERENCES transport_listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES transport_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_listings_geom ON transport_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_transport_listings_name_trgm ON transport_listings USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION transport_listings_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transport_listings_geom ON transport_listings;
CREATE TRIGGER trg_transport_listings_geom
  BEFORE INSERT OR UPDATE ON transport_listings
  FOR EACH ROW EXECUTE FUNCTION transport_listings_set_geom();

-- sub-categories matching the directory's transport sections
INSERT INTO transport_categories (slug, label, sort_order) VALUES
  ('taxis',        'Taxis & Públicos',  1),
  ('car-rental',   'Car Rental',        2),
  ('airlines',     'Airlines',          3),
  ('ferry',        'Ferry',             4),
  ('scooter-bike', 'Scooter & Bike',    5),
  ('water-taxi',   'Water Taxi',        6)
ON CONFLICT (slug) DO NOTHING;
