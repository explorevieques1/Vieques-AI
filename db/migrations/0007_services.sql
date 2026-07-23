-- 0007_services.sql
-- Services: a fixed set of service categories and the listings under them.
-- Mirrors the activities pattern. has_location marks whether a listing has a
-- mappable physical address (some services are phone-only / non-physical).

CREATE TABLE IF NOT EXISTS service_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_listings (
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
  has_location  boolean NOT NULL DEFAULT false,  -- true = mappable physical place
  hours         text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_listing_categories (
  listing_id  bigint NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_service_listings_geom ON service_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_service_listings_name_trgm ON service_listings USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION service_listings_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_listings_geom ON service_listings;
CREATE TRIGGER trg_service_listings_geom
  BEFORE INSERT OR UPDATE ON service_listings
  FOR EACH ROW EXECUTE FUNCTION service_listings_set_geom();

INSERT INTO service_categories (slug, label, sort_order) VALUES
  ('emergency',         'Emergency',          1),
  ('physicians',        'Physicians',         2),
  ('dental',            'Dental',             3),
  ('municipal',         'Municipal',          4),
  ('pool-maintenance',  'Pool Maintenance',   5),
  ('towing',            'Towing',             6),
  ('mechanic',          'Mechanic',           7),
  ('solar',             'Solar',              8),
  ('real-estate',       'Real Estate',        9),
  ('exterminator',      'Exterminator',      10),
  ('veterinarian',      'Veterinarian',      11),
  ('babysitting',       'Babysitting',       12),
  ('housekeeping',      'House Keeping',     13),
  ('accountant',        'Accountant',        14),
  ('attorney',          'Attorney',          15),
  ('catering',          'Catering',          16),
  ('photography',       'Photography',       17)
ON CONFLICT (slug) DO NOTHING;
