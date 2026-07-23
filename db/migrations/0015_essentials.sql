-- 0015_essentials.sql
-- Essential services: gas, groceries, pharmacies, banks, etc. All physical
-- (map pins). Same pattern as services. Schema + categories only, no listings.

CREATE TABLE IF NOT EXISTS essential_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS essential_listings (
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

CREATE TABLE IF NOT EXISTS essential_listing_categories (
  listing_id  bigint NOT NULL REFERENCES essential_listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES essential_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_essential_listings_geom ON essential_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_essential_listings_name_trgm ON essential_listings USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION essential_listings_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_essential_listings_geom ON essential_listings;
CREATE TRIGGER trg_essential_listings_geom
  BEFORE INSERT OR UPDATE ON essential_listings
  FOR EACH ROW EXECUTE FUNCTION essential_listings_set_geom();

-- the 8 sidebar categories
INSERT INTO essential_categories (slug, label, sort_order) VALUES
  ('gas-stations',       'Gas Stations',                 1),
  ('convenience-stores', 'Convenience Stores',           2),
  ('grocery-stores',     'Grocery Stores / Supermarkets',3),
  ('pharmacies',         'Pharmacies',                   4),
  ('hardware-stores',    'Hardware Stores',              5),
  ('banks-atms',         'Banks & ATMs',                 6),
  ('post-office',        'Post Office',                  7),
  ('laundry',            'Laundry / Laundromats',        8)
ON CONFLICT (slug) DO NOTHING;