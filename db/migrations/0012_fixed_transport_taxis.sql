-- 0012_fix_transport_taxis.sql
-- Corrective + idempotent migration. Safe to run regardless of prior state.
-- 1) ensures all 6 transport categories exist (re-seeds any missing)
-- 2) ensures is_physical is set correctly
-- 3) seeds the 9 taxi listings and links them to the taxis category

-- 1) categories (no-op if already present)
INSERT INTO transport_categories (slug, label, sort_order) VALUES
  ('taxis',        'Taxis & Públicos',  1),
  ('car-rental',   'Car Rental',        2),
  ('airlines',     'Airlines',          3),
  ('ferry',        'Ferry',             4),
  ('scooter-bike', 'Scooter & Bike',    5),
  ('water-taxi',   'Water Taxi',        6)
ON CONFLICT (slug) DO NOTHING;

-- 2) physical flags
UPDATE transport_categories SET is_physical = true;
UPDATE transport_categories SET is_physical = false WHERE slug = 'taxis';

-- 3) taxi listings
INSERT INTO transport_listings (name, phones, metadata)
SELECT v.name, v.phones, '{}'::jsonb
FROM (VALUES
  ('Kalet Pérez',                     ARRAY['787-585-9560']),
  ('Miguel Ayala',                    ARRAY['787-328-3940']),
  ('Tata Robles',                     ARRAY['787-486-0267']),
  ('Tuty',                            ARRAY['787-209-3007']),
  ('Letty Perez / Kiany Tours',       ARRAY['787-556-6003']),
  ('M&M Taxi',                        ARRAY['939-208-1600']),
  ('Vieques Island Taxi 24/7',        ARRAY['939-367-2733']),
  ('Vieques Taxi',                    ARRAY['787-741-8294']),
  ('Vieques Tours & Transportation',  ARRAY['787-397-2048'])
) AS v(name, phones)
WHERE NOT EXISTS (
  SELECT 1 FROM transport_listings t WHERE t.name = v.name
);

-- link them to the taxis category
INSERT INTO transport_listing_categories (listing_id, category_id)
SELECT l.id, c.id
FROM transport_listings l, transport_categories c
WHERE c.slug = 'taxis'
  AND l.name IN (
    'Kalet Pérez','Miguel Ayala','Tata Robles','Tuty',
    'Letty Perez / Kiany Tours','M&M Taxi','Vieques Island Taxi 24/7',
    'Vieques Taxi','Vieques Tours & Transportation'
  )
  AND NOT EXISTS (
    SELECT 1 FROM transport_listing_categories x
    WHERE x.listing_id = l.id AND x.category_id = c.id
  );