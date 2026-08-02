-- 0039_kayak_tour_companies.sql
-- Tag the companies that run kayak tours, so kayaking's "Book a Tour" has
-- something to show.
--
-- This is the payoff of 0038: no new table, no new endpoint, no new adapter.
-- A company that offers a third activity gets a third row in
-- activity_listing_categories, and it appears under that chip carrying the
-- same phone, hours, website and coordinates it already had. Abes is now
-- tagged bio-bay + snorkeling + kayaking and shows up under all three.
--
-- Only Abes is tagged here, confirmed by hand. The source for these eight
-- companies was a printed list headed "BIOBAY TOURS", which says nothing about
-- who rents or guides kayaks — tagging the rest on the strength of a company
-- name would be inventing data a visitor might act on. Add the others as you
-- confirm them; the pattern is the commented INSERT at the bottom.

BEGIN;

-- Guard: fail loudly rather than silently tagging nothing if the slug or the
-- listing name ever changes. `count` covers both sides in one check — 1 row
-- means one listing matched one category.
DO $$
DECLARE matched int;
BEGIN
  SELECT count(*) INTO matched
    FROM activity_listings l, activity_categories c
   WHERE l.name = 'Abes' AND c.slug = 'kayaking';
  IF matched <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one (Abes x kayaking) pair, found %. '
                    'Check activity_listings.name and activity_categories.slug.',
                    matched;
  END IF;
END $$;

INSERT INTO activity_listing_categories (listing_id, category_id)
SELECT l.id, c.id
  FROM activity_listings l, activity_categories c
 WHERE l.name = 'Abes'
   AND c.slug = 'kayaking'
ON CONFLICT (listing_id, category_id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- verify — what kayaking's "Book a Tour" will list
-- ---------------------------------------------------------------------------
SELECT l.name, l.phones, l.hours, l.website, l.has_location
  FROM activity_listings l
  JOIN activity_listing_categories lc ON lc.listing_id = l.id
  JOIN activity_categories c ON c.id = lc.category_id
 WHERE c.slug = 'kayaking' AND l.is_active = true
 ORDER BY l.name;

-- ---------------------------------------------------------------------------
-- TODO: add the rest as you confirm they run kayak trips
-- ---------------------------------------------------------------------------
-- Black Beard Sports and Jak Water Sports are the likely candidates — both are
-- general watersports outfits with retail storefronts — but neither was
-- confirmed, so neither is tagged.
--
-- INSERT INTO activity_listing_categories (listing_id, category_id)
-- SELECT l.id, c.id
--   FROM activity_listings l, activity_categories c
--  WHERE l.name IN ('Black Beard Sports', 'Jak Water Sports')
--    AND c.slug = 'kayaking'
-- ON CONFLICT DO NOTHING;
