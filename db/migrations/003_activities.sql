-- 0003_activities.sql
-- Activities: a fixed set of activity categories (snorkeling, diving, ...) and
-- the listings (pins) that belong to them. Mirrors the listings/categories pattern.

-- ---------------------------------------------------------------------------
-- activity_categories: the 17 activity types shown in the sidebar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_categories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- activity_listings: the actual pins (companies / places / spots)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_listings (
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
  price_info    text,
  hours         text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- join: a listing can belong to several activity categories
--   (e.g. Black Beard Sports -> snorkeling, diving, kayaking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_listing_categories (
  listing_id  bigint NOT NULL REFERENCES activity_listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES activity_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_activity_listings_geom ON activity_listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_activity_listings_name_trgm ON activity_listings USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- keep geom synced from lat/lng + touch updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION activity_listings_set_geom() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_listings_geom ON activity_listings;
CREATE TRIGGER trg_activity_listings_geom
  BEFORE INSERT OR UPDATE ON activity_listings
  FOR EACH ROW EXECUTE FUNCTION activity_listings_set_geom();

-- ---------------------------------------------------------------------------
-- seed the 17 activity categories (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO activity_categories (slug, label, sort_order) VALUES
  ('snorkeling',        'Snorkeling',          1),
  ('diving',            'Diving',              2),
  ('kayaking',          'Kayaking',            3),
  ('fishing',           'Fishing',             4),
  ('camping',           'Camping',             5),
  ('sailing',           'Sailing',             6),
  ('bio-bay',           'Bio Bay',             7),
  ('horseback-riding',  'Horseback Riding',    8),
  ('view-points',       'View Points',         9),
  ('landmarks',         'Landmarks',          10),
  ('art-galleries',     'Art Galleries',      11),
  ('sunsets',           'Sunsets',            12),
  ('wellness-yoga',     'Wellness & Yoga',    13),
  ('nightlife',         'Nightlife',          14),
  ('local-markets',     'Local Markets',      15),
  ('stargazing',        'Stargazing',         16),
  ('adventures',        'Adventures',         17)
ON CONFLICT (slug) DO NOTHING;