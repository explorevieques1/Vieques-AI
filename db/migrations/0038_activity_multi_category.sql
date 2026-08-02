-- 0038_activity_multi_category.sql
-- Retire snorkel_tour_operators; tour companies live in activity_listings.
--
-- 0036 gave snorkel tour companies their own table. That was a misreading of
-- why snorkelling/kayaking/hiking have dedicated tables: they carry *geometry*
-- (zone polygons, trail LineStrings) that a listing row cannot hold. A tour
-- company has no geometry — it is "a business with a name, a phone and maybe
-- one point", which is exactly what activity_listings already models, and what
-- 0035_activity_location_images.sql explicitly declined to split up.
--
-- The cost of that mistake was a duplicate record. Black Beard Sports existed
-- as both activity_listings #19 (with hours, website, coordinates) and
-- snorkel_tour_operators #2 (phone only) — and the snorkel "Book a Tour"
-- toggle read the emptier of the two.
--
-- The fix needs no new structure. activity_listing_categories has been the
-- right answer since 003_activities.sql, whose comment names this exact case:
--
--     -- join: a listing can belong to several activity categories
--     --   (e.g. Black Beard Sports -> snorkeling, diving, kayaking)
--
-- One company, one row, one category row per activity it offers.
--
-- Per-tour fields (duration, price_info, departure, booking_notes) are NOT
-- preserved here: all five were null for all eight operators — the source was a
-- printed list of names and phone numbers. When real per-tour data arrives it
-- wants an `activity_offerings` table keyed (listing_id, category_id), because
-- a company's snorkel trip and its bio bay trip differ in length and price.
-- That is additive on top of this migration, not a replacement for it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. safety: every operator must already exist as a listing
-- ---------------------------------------------------------------------------
-- Verified at authoring time — all eight matched by name, every phone was
-- already identical, and every descriptive column on the operator side was
-- null, so this migration loses nothing. The guard makes that a precondition
-- rather than a memory: if this runs against a database where someone added a
-- ninth operator with no matching listing, it fails instead of dropping it.
DO $$
DECLARE orphans text;
BEGIN
  SELECT string_agg(o.name, ', ')
    INTO orphans
    FROM snorkel_tour_operators o
   WHERE NOT EXISTS (
     SELECT 1 FROM activity_listings l WHERE l.name = o.name
   );
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Operators with no matching activity_listing: %. '
                    'Create the listings first, then re-run.', orphans;
  END IF;
END $$;

-- Likewise refuse to discard per-tour detail that someone filled in by hand
-- between 0036 and this migration. Nothing to salvage today; if that changes,
-- this stops the migration rather than silently dropping the work.
DO $$
DECLARE filled text;
BEGIN
  SELECT string_agg(name, ', ')
    INTO filled
    FROM snorkel_tour_operators
   WHERE COALESCE(tour_details, duration, price_info,
                  departure, booking_notes, description) IS NOT NULL;
  IF filled IS NOT NULL THEN
    RAISE EXCEPTION 'These operators carry per-tour data that this migration '
                    'would discard: %. Build activity_offerings first.', filled;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. carry across any contact detail the listing is missing
-- ---------------------------------------------------------------------------
-- All phones already agreed at authoring time, so in practice these are
-- no-ops. They exist so the migration is correct rather than lucky: COALESCE
-- fills only what is absent on the listing, and the phone append runs only
-- when the number is genuinely not in the array already.
UPDATE activity_listings l
   SET email   = COALESCE(l.email, o.email),
       website = COALESCE(l.website, o.website)
  FROM snorkel_tour_operators o
 WHERE l.name = o.name
   AND (l.email IS NULL OR l.website IS NULL);

UPDATE activity_listings l
   SET phones = l.phones || o.phone
  FROM snorkel_tour_operators o
 WHERE l.name = o.name
   AND o.phone IS NOT NULL
   AND NOT (o.phone = ANY(l.phones));

-- ---------------------------------------------------------------------------
-- 3. tag the companies with the activities they actually offer
-- ---------------------------------------------------------------------------
-- Everything in snorkel_tour_operators was, by definition, a snorkel tour
-- company — that is what the table was for — so every one of them earns the
-- 'snorkeling' chip. Their existing bio-bay tagging is untouched: these
-- companies genuinely do both, which is the whole point of the join table.
INSERT INTO activity_listing_categories (listing_id, category_id)
SELECT l.id, c.id
  FROM snorkel_tour_operators o
  JOIN activity_listings l ON l.name = o.name
  JOIN activity_categories c ON c.slug = 'snorkeling'
ON CONFLICT (listing_id, category_id) DO NOTHING;

-- Kayaking is deliberately NOT auto-tagged. The printed list said "BIOBAY
-- TOURS" and nothing about who paddles, so tagging all eight would be
-- inventing data. Add them by hand as you confirm each one — the pattern is
-- the commented UPDATE at the bottom of this file.

-- ---------------------------------------------------------------------------
-- 4. drop the duplicate
-- ---------------------------------------------------------------------------
-- snorkel_spot_operators goes first: it references the operators table, and
-- its own reason for existing (which company serves which spot) is not
-- something the category join needs to reproduce. A company that runs snorkel
-- tours is listed under snorkelling; which specific reef it visits on a given
-- day was seeded as an all-to-all cross join anyway, i.e. no information.
DROP TABLE IF EXISTS snorkel_spot_operators;
DROP TABLE IF EXISTS snorkel_tour_operators;

-- The RLS policies from 0037 went with the tables. The trigger function did
-- not — it is standalone and now unreferenced.
DROP FUNCTION IF EXISTS snorkel_tour_operators_touch();

-- snorkel_spots.phone / email / website (added in 0036) are deliberately KEPT.
-- Those were never the duplication — a spot with a concession stand or a park
-- office has a real contact, and the columns are empty rather than wrong.

COMMIT;

-- ---------------------------------------------------------------------------
-- verify
-- ---------------------------------------------------------------------------
SELECT l.name, l.phones, l.hours,
       string_agg(c.slug, ', ' ORDER BY c.slug) AS categories
  FROM activity_listings l
  JOIN activity_listing_categories lc ON lc.listing_id = l.id
  JOIN activity_categories c ON c.id = lc.category_id
 WHERE EXISTS (
   SELECT 1 FROM activity_listing_categories lc2
     JOIN activity_categories c2 ON c2.id = lc2.category_id
    WHERE lc2.listing_id = l.id AND c2.slug = 'snorkeling'
 )
 GROUP BY l.id, l.name, l.phones, l.hours
 ORDER BY l.name;

-- ---------------------------------------------------------------------------
-- TODO: tag the companies that also run kayak trips, once confirmed
-- ---------------------------------------------------------------------------
-- INSERT INTO activity_listing_categories (listing_id, category_id)
-- SELECT l.id, c.id
--   FROM activity_listings l, activity_categories c
--  WHERE l.name IN ('Black Beard Sports', 'Jak Water Sports')
--    AND c.slug = 'kayaking'
-- ON CONFLICT DO NOTHING;
