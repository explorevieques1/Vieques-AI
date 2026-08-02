-- biobay_tours_seed.sql
-- Bio bay tour operators — name + phone only. Everything else (description,
-- website, hours, price_info, address) gets filled in by hand afterwards.
--
-- No latitude/longitude on purpose: these are tour companies that pick you up,
-- not places you walk into. The trigger therefore leaves has_location = false
-- and geom NULL, so they list in the directory without dropping a pin at an
-- address that would mean nothing to a visitor. Add coordinates later for any
-- operator that turns out to have a real storefront and the trigger will
-- promote it to mappable automatically — see
-- db/migrations/0035_activity_location_images.sql.
--
-- Safe to re-run. There is no UNIQUE constraint on activity_listings.name —
-- only the primary key — so `ON CONFLICT (name)` is not available and
-- `ON CONFLICT DO NOTHING` would quietly do nothing at all, leaving a second
-- run with sixteen bio bay companies. The insert therefore filters with an
-- explicit NOT EXISTS instead.

BEGIN;

-- Guard: bio-bay must be category id 7. If the ids ever shift, fail loudly
-- here rather than silently tagging eight listings into the wrong category.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activity_categories WHERE id = 7 AND slug = 'bio-bay') THEN
    RAISE EXCEPTION 'Category id 7 is not bio-bay — check activity_categories before seeding';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- the operators
-- ---------------------------------------------------------------------------
-- Abes' number is deliberately absent: the source photo cut off its final
-- digit (787-435-136_). Fill it in with the UPDATE at the bottom of this file.
WITH incoming (name, phones) AS (
  VALUES
    ('Abes',                        '{}'::text[]),
    ('Black Beard Sports',          '{"939-283-6841"}'::text[]),
    ('Fun Brothers',                '{"787-435-9372"}'::text[]),
    ('Isla Nena Bio Bay Tours',     '{"787-403-5581"}'::text[]),
    ('Jak Water Sports',            '{"787-644-7112"}'::text[]),
    ('Melaya''s Tours',             '{"787-222-7055"}'::text[]),
    ('Mosquito Bay Tours',          '{"939-426-8561"}'::text[]),
    ('Travesias Isleñas',           '{"787-447-4104"}'::text[])
),
inserted AS (
  INSERT INTO activity_listings (name, phones)
  SELECT i.name, i.phones
    FROM incoming i
   WHERE NOT EXISTS (
     SELECT 1 FROM activity_listings l WHERE l.name = i.name
   )
  RETURNING id, name
)
SELECT count(*) AS listings_inserted FROM inserted;

-- Tag every one of them as bio-bay. Separate from the insert above so a re-run
-- still repairs the join for any listing that already existed.
INSERT INTO activity_listing_categories (listing_id, category_id)
SELECT l.id, 7
  FROM activity_listings l
 WHERE l.name IN (
   'Abes', 'Black Beard Sports', 'Fun Brothers', 'Isla Nena Bio Bay Tours',
   'Jak Water Sports', 'Melaya''s Tours', 'Mosquito Bay Tours', 'Travesias Isleñas'
 )
ON CONFLICT (listing_id, category_id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- verify
-- ---------------------------------------------------------------------------
SELECT l.id, l.name, l.phones, l.has_location
  FROM activity_listings l
  JOIN activity_listing_categories lc ON lc.listing_id = l.id
 WHERE lc.category_id = 7
 ORDER BY l.name;

-- ---------------------------------------------------------------------------
-- TODO: Abes' phone number — last digit was unreadable in the source photo.
-- ---------------------------------------------------------------------------
-- UPDATE activity_listings
--    SET phones = '{"787-435-136X"}'
--  WHERE name = 'Abes';
--
-- Isla Nena is listed as "(boat)" in the source; note that in `description`
-- when you fill the rest in.
