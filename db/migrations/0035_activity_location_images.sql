-- 0035_activity_location_images.sql
-- Brings activity_listings in line with every other listing table.
--
-- Two gaps, both from 003_activities.sql being the first listing table written
-- (services/transport/restaurants/essentials/stays all learned from it and then
-- added things it never got back):
--
--   1. has_location — every sibling listing table has it; activities did not.
--      Without it there is no way to say "this row is a real business with no
--      mappable address" (a bio bay tour operator that picks you up, a sailing
--      charter that meets at a dock it does not own) as distinct from "this row
--      is a place" (a landmark, a viewpoint). Both look like NULL lat/lng, so
--      the map and the directory cannot tell them apart.
--
--   2. images[] / image_credit — landmarks, viewpoints, sunset spots and
--      stargazing sites are pure points of interest with no phone and no
--      website. A card for one is a photo or it is nothing. beaches (0030) and
--      stay_listings (0027) already carry exactly these two columns and
--      place.ts already reads `images[0]` + `image_credit` off both, so this is
--      the shape the frontend can consume with no new adapter concept.
--
-- Deliberately NOT adding a separate table per activity. horseback riding, bio
-- bay operators, sailing charters and galleries are all "a business with a
-- name, a phone and one point" — the same columns. Only snorkelling, kayaking
-- and hiking get their own tables, because they carry geometry (zone polygons,
-- trail LineStrings) that a listing row cannot hold.

-- ---------------------------------------------------------------------------
-- columns
-- ---------------------------------------------------------------------------
ALTER TABLE activity_listings
  ADD COLUMN IF NOT EXISTS has_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_credit text;

COMMENT ON COLUMN activity_listings.has_location IS
  'True = mappable physical place (pin on the map). Set automatically by the '
  'trigger whenever latitude+longitude are present; leave lat/lng NULL for an '
  'operator that has no walk-in address.';
COMMENT ON COLUMN activity_listings.images IS
  'Photo URLs, first one is the card image. Same shape as beaches.images.';

-- Backfill: any row already carrying coordinates is a physical place. The
-- table is empty today, but this keeps the migration correct if it is applied
-- after a seed rather than before one.
UPDATE activity_listings
   SET has_location = true
 WHERE latitude IS NOT NULL
   AND longitude IS NOT NULL
   AND has_location = false;

-- ---------------------------------------------------------------------------
-- trigger: keep geom AND has_location in sync with lat/lng
-- ---------------------------------------------------------------------------
-- Replaces the 003_activities.sql version, which set geom but knew nothing
-- about has_location. Written the way 0027_stays.sql writes it: an explicit
-- search_path so ST_SetSRID resolves on Supabase (PostGIS lives in
-- `extensions`) and on a local Postgres (where it lives in `public`).
--
-- The NULL branch clears both fields rather than leaving them stale: editing a
-- listing to remove its coordinates must un-map it, otherwise the old geom
-- survives and the pin stays on the map at an address the business left.
CREATE OR REPLACE FUNCTION public.activity_listings_set_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    NEW.has_location = true;
  ELSE
    NEW.geom = NULL;
    NEW.has_location = false;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_listings_geom ON public.activity_listings;
CREATE TRIGGER trg_activity_listings_geom
  BEFORE INSERT OR UPDATE ON public.activity_listings
  FOR EACH ROW EXECUTE FUNCTION public.activity_listings_set_geom();

-- ---------------------------------------------------------------------------
-- index
-- ---------------------------------------------------------------------------
-- Every read path filters `is_active AND has_location` before plotting pins.
CREATE INDEX IF NOT EXISTS idx_activity_listings_mappable
  ON activity_listings (has_location)
  WHERE is_active = true;

INSERT INTO schema_migrations (filename) VALUES ('0035_activity_location_images.sql')
ON CONFLICT (filename) DO NOTHING;
