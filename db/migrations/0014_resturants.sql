-- 0013_restaurants.sql
-- Restaurants: category sidebar + listings (pins). Schema only, no seed data.

CREATE TABLE IF NOT EXISTS restaurant_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_listings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  phones        text[] NOT NULL DEFAULT '{}',
  cuisine       text,                 -- free-text cuisine note
  price         text,                 -- e.g. $ / $$ / $$$
  hours         text,
  email         text,
  website       text,
  address       text,
  location_area text,
  latitude      double precision,
  longitude     double precision,
  geom          geography(Point, 4326),
  has_location  boolean NOT NULL DEFAULT false,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_listing_categories (
  listing_id  bigint NOT NULL REFERENCES restaurant_listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES restaurant_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_listings_geom ON restaurant_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_restaurant_listings_name_trgm ON restaurant_listings USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION restaurant_listings_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restaurant_listings_geom ON restaurant_listings;
CREATE TRIGGER trg_restaurant_listings_geom
  BEFORE INSERT OR UPDATE ON restaurant_listings
  FOR EACH ROW EXECUTE FUNCTION restaurant_listings_set_geom();

-- the 10 sidebar categories (these ARE schema, not listing data)
INSERT INTO restaurant_categories (slug, label, sort_order) VALUES
  ('fine-dining',  'Fine Dining',   1),
  ('seafood',      'Seafood',       2),
  ('waterfront',   'Waterfront',    3),
  ('bar-grill',    'Bar & Grill',   4),
  ('local',        'Local',         5),
  ('casual',       'Casual',        6),
  ('vegan',        'Vegan',         7),
  ('italian',      'Italian',       8),
  ('breakfast',    'Breakfast',     9),
  ('mexican',      'Mexican',      10)
ON CONFLICT (slug) DO NOTHING;