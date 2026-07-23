-- 0011_taxis_seed.sql
-- Seed taxi drivers/companies (non-physical -> shown in the list pane).
-- Taxi-specific fields go in metadata JSONB. Idempotent: skips by name.
-- vehicle_type / passengers / plate left null where unknown; fill later.

INSERT INTO transport_listings (name, phones, metadata)
SELECT v.name, v.phones, v.meta::jsonb
FROM (VALUES
  ('Kalet Pérez',                     ARRAY['787-585-9560'],            '{}'),
  ('Miguel Ayala',                    ARRAY['787-328-3940'],            '{}'),
  ('Tata Robles',                     ARRAY['787-486-0267'],            '{}'),
  ('Tuty',                            ARRAY['787-209-3007'],            '{}'),
  ('Letty Perez / Kiany Tours',       ARRAY['787-556-6003'],            '{}'),
  ('M&M Taxi',                        ARRAY['939-208-1600'],            '{}'),
  ('Vieques Island Taxi 24/7',        ARRAY['939-367-2733'],            '{}'),
  ('Vieques Taxi',                    ARRAY['787-741-8294'],            '{}'),
  ('Vieques Tours & Transportation',  ARRAY['787-397-2048'],            '{}')
) AS v(name, phones, meta)
WHERE NOT EXISTS (
  SELECT 1 FROM transport_listings t WHERE t.name = v.name
);

-- link each to the taxis category
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