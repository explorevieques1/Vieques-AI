-- 0010_car_rentals_seed.sql
-- Seed two car rental companies (physical) with their vehicle fleets.
-- Idempotent: skips a company if a listing with the same name already exists,
-- so re-running the migration won't create duplicates.

-- ============ Maritza's Car Rental ============
INSERT INTO transport_listings (name, phones, email, address, latitude, longitude, hours)
SELECT 'Maritza''s Car Rental', ARRAY['787-741-0078'], 'info@maritzas.com',
       'Rd 200, Isabel II, Vieques', 18.1402, -65.4450, 'Mon-Sat 8am-5pm'
WHERE NOT EXISTS (
  SELECT 1 FROM transport_listings WHERE name = 'Maritza''s Car Rental'
);

INSERT INTO transport_listing_categories (listing_id, category_id)
SELECT l.id, c.id
FROM transport_listings l, transport_categories c
WHERE l.name = 'Maritza''s Car Rental' AND c.slug = 'car-rental'
  AND NOT EXISTS (
    SELECT 1 FROM transport_listing_categories x
    WHERE x.listing_id = l.id AND x.category_id = c.id
  );

INSERT INTO transport_vehicles (listing_id, make, model, doors, passengers, sort_order)
SELECT l.id, v.make, v.model, v.doors, v.passengers, v.so
FROM transport_listings l
CROSS JOIN (VALUES
  ('Toyota', 'Corolla', 4, 5, 1),
  ('Jeep',   'Wrangler', 2, 4, 2),
  ('Toyota', 'RAV4',     4, 5, 3)
) AS v(make, model, doors, passengers, so)
WHERE l.name = 'Maritza''s Car Rental'
  AND NOT EXISTS (SELECT 1 FROM transport_vehicles tv WHERE tv.listing_id = l.id);

-- ============ Coquí Car Rental ============
INSERT INTO transport_listings (name, phones, email, address, latitude, longitude, hours)
SELECT 'Coquí Car Rental', ARRAY['787-741-3696'], NULL,
       'Isabel II, Vieques', 18.1455, -65.4430, 'Daily 8am-6pm'
WHERE NOT EXISTS (
  SELECT 1 FROM transport_listings WHERE name = 'Coquí Car Rental'
);

INSERT INTO transport_listing_categories (listing_id, category_id)
SELECT l.id, c.id
FROM transport_listings l, transport_categories c
WHERE l.name = 'Coquí Car Rental' AND c.slug = 'car-rental'
  AND NOT EXISTS (
    SELECT 1 FROM transport_listing_categories x
    WHERE x.listing_id = l.id AND x.category_id = c.id
  );

INSERT INTO transport_vehicles (listing_id, make, model, doors, passengers, sort_order)
SELECT l.id, v.make, v.model, v.doors, v.passengers, v.so
FROM transport_listings l
CROSS JOIN (VALUES
  ('Jeep',   'Wrangler', 4, 5, 1),
  ('Suzuki', 'Vitara',   4, 5, 2)
) AS v(make, model, doors, passengers, so)
WHERE l.name = 'Coquí Car Rental'
  AND NOT EXISTS (SELECT 1 FROM transport_vehicles tv WHERE tv.listing_id = l.id);