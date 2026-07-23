-- 0001_foundation.sql
-- Vieques AI — foundational schema.
-- Minimal but real: enough to verify extensions work end-to-end.
-- The full data model (beaches, accommodations, richer fields) comes next.

-- ---------------------------------------------------------------------------
-- categories: Restaurants, Scuba, Taxis, Lodging, etc. (from the directory)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- listings: every business / service entry
--   - phones as text[] (entries legitimately have multiple numbers)
--   - geom as PostGIS point for map + distance queries
--   - embedding for semantic search (1536 dims = OpenAI/Voyage small; adjust
--     to whatever embedding model you settle on)
--   - metadata jsonb for category-specific extras
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  description   text,
  phones        text[] NOT NULL DEFAULT '{}',
  email         text,
  website       text,
  address       text,
  location_area text,                         -- e.g. Isabel II, Esperanza
  geom          geography(Point, 4326),        -- nullable until geocoded
  embedding     vector(1536),                  -- nullable until generated
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- listing_categories: many-to-many (one business -> many categories)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_categories (
  listing_id  bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_listings_geom        ON listings USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_listings_name_trgm   ON listings USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_metadata    ON listings USING gin (metadata);
-- Vector index: ivfflat needs data to train on; create it later after seeding.
-- Placeholder note kept here intentionally.

-- ---------------------------------------------------------------------------
-- updated_at auto-touch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_updated_at ON listings;
CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
