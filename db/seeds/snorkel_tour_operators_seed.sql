-- snorkel_tour_operators_seed.sql
-- The eight companies from the printed "BIOBAY TOURS" list. Most of them run
-- snorkeling trips alongside the bio bay night tours, which is why the same
-- names appear in db/seeds/biobay_tours_seed.sql as activity_listings rows.
--
-- Requires db/migrations/0036_snorkel_tour_operators.sql.
--
-- Safe to re-run: snorkel_tour_operators.name is UNIQUE, so ON CONFLICT
-- updates the phone instead of inserting a duplicate. Descriptive columns are
-- left alone on conflict — once you write real copy by hand, a re-run of this
-- seed must not wipe it.

BEGIN;

INSERT INTO snorkel_tour_operators (name, phone) VALUES
  ('Abes',                    '787-435-1362'),
  ('Black Beard Sports',      '939-283-6841'),
  ('Fun Brothers',            '787-435-9372'),
  ('Isla Nena Bio Bay Tours', '787-403-5581'),
  ('Jak Water Sports',        '787-644-7112'),
  ('Melaya''s Tours',         '787-222-7055'),
  ('Mosquito Bay Tours',      '939-426-8561'),
  ('Travesias Isleñas',       '787-447-4104')
ON CONFLICT (name) DO UPDATE
  SET phone = EXCLUDED.phone,
      updated_at = now();

-- Flip the toggle on. "Book a Tour" filters snorkel_spots on offers_tours
-- (0006_snorkel_tours.sql), so every mappable spot has to be marked or the
-- tab comes back empty even though the operators exist.
UPDATE snorkel_spots
   SET offers_tours = true
 WHERE is_active = true;

-- Attach every operator to every spot. These companies are generalists — they
-- will take you wherever the water is good that day — so the honest starting
-- point is a full join. Narrow it per-operator once you confirm who actually
-- runs which reef.
INSERT INTO snorkel_spot_operators (spot_id, operator_id)
SELECT s.id, o.id
  FROM snorkel_spots s
 CROSS JOIN snorkel_tour_operators o
 WHERE s.is_active = true AND o.is_active = true
ON CONFLICT (spot_id, operator_id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- verify
-- ---------------------------------------------------------------------------
SELECT o.name, o.phone, count(so.spot_id) AS spots
  FROM snorkel_tour_operators o
  LEFT JOIN snorkel_spot_operators so ON so.operator_id = o.id
 GROUP BY o.id, o.name, o.phone
 ORDER BY o.name;

-- ---------------------------------------------------------------------------
-- TODO — fill in by hand, the photo carries none of this
-- ---------------------------------------------------------------------------
-- UPDATE snorkel_tour_operators SET
--   description   = '...',
--   tour_details  = '...',
--   duration      = '...',
--   price_info    = '...',
--   departure     = '...',
--   booking_notes = '...',
--   email = '...', website = '...'
-- WHERE name = 'Black Beard Sports';
--
-- Phone numbers to re-check against the printed list. The bio bay seed read
-- three of these differently from the same photo, so one of the two is wrong:
--   Abes                    biobay: 787-435-136? (cut off)  here: 787-435-1362
--   Isla Nena Bio Bay Tours biobay: 787-403-5581  here: 787-403-5581  (agrees)
--   Melaya's Tours          biobay: 787-222-7055  here: 787-222-7055  (agrees)
-- Isla Nena is "(boat)" on the printed list — worth saying in tour_details.
