-- restaurants_seed.sql
-- Populates restaurant_listings from the provided CSV (name, lat, lng) plus
-- category assignments so the frontend filters work. Contact details (phone,
-- hours, website) are intentionally left NULL where not reliably verified —
-- fill those from authoritative sources rather than risk stale data for tourists.
--
-- Idempotent: skips a restaurant if one with the same name already exists.
-- geom / has_location are set automatically by the existing trigger from lat/lng.
--
-- location_area: 'Isabel II' (north town) or 'Esperanza' (south malecón), by coords.

BEGIN;

-- Helper: insert a listing if absent, then link it to one or more categories.
-- We do this per-restaurant with a CTE so the new id flows to the join table.

-- ============================================================
-- ISABEL II (north) restaurants
-- ============================================================

-- Mar Azul (north waterfront bar) - two locations in CSV; this is the north one
WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mar Azul', 'Waterfront bar', '$$', 'Isabel II', 18.1513, -65.4429
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mar Azul' AND latitude=18.1513)
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('waterfront','bar-grill');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'La Tabla', 'Local Puerto Rican', '$$', 'Isabel II', 18.15, -65.4428
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='La Tabla')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Plaza', 'Local Puerto Rican', '$$', 'Isabel II', 18.1494, -65.4417
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Plaza')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

-- Taverna - verified Italian, Calle Carlos LeBrum 453, dinner Thu-Sun
WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, phones, address, hours, location_area, latitude, longitude)
  SELECT 'Taverna', 'Italian', '$$', ARRAY['787-438-1100'],
         'Calle Carlos LeBrum 453, Isabel Segunda',
         'Thu-Sun 5:30pm-9:00pm', 'Isabel II', 18.1502, -65.4413
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Taverna')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('italian','fine-dining');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'D''Frozz', 'Frozen treats & snacks', '$', 'Isabel II', 18.1488, -65.4421
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='D''Frozz')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Rising Roost', 'Cafe & breakfast', '$$', 'Isabel II', 18.1493, -65.4426
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Rising Roost')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('breakfast','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mesita', 'Italian', '$$', 'Isabel II', 18.1492, -65.443
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mesita')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('italian','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Passione', 'Italian', '$$', 'Isabel II', 18.1477, -65.4428
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Passione')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('italian','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Reencuentro', 'Local Puerto Rican', '$$', 'Isabel II', 18.1491, -65.4419
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Reencuentro')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Burgernauta', 'Burgers', '$$', 'Isabel II', 18.1482, -65.4413
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Burgernauta')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Vieques Bakery', 'Bakery & breakfast', '$', 'Isabel II', 18.1477, -65.4411
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Vieques Bakery')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('breakfast','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Casa Nativo', 'Local Puerto Rican', '$$', 'Isabel II', 18.1468, -65.4411
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Casa Nativo')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Bieke''s Bistro', 'Bistro / breakfast', '$$', 'Isabel II', 18.1471, -65.4411
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Bieke''s Bistro')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('breakfast','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mama Mia', 'Italian', '$$', 'Isabel II', 18.1473, -65.4413
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mama Mia')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('italian','casual');

-- Mar Azul (south location from CSV row 15)
WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mar Azul', 'Waterfront bar', '$$', 'Isabel II', 18.1471, -65.4414
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mar Azul' AND latitude=18.1471)
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('waterfront','bar-grill');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Lydia''s Bakery', 'Bakery & breakfast', '$', 'Isabel II', 18.1505, -65.4429
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Lydia''s Bakery')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('breakfast','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Yate', 'Seafood', '$$', 'Isabel II', 18.1529, -65.4428
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Yate')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('seafood','local');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Norte', 'Local Puerto Rican', '$$', 'Isabel II', 18.1526, -65.4425
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Norte')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'William''s Pizza', 'Pizza', '$', 'Isabel II', 18.1489, -65.4424
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='William''s Pizza')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('italian','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mana', 'Healthy / vegan-friendly', '$$', 'Isabel II', 18.1463, -65.4417
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mana')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('vegan','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'La Palma', 'Local Puerto Rican', '$$', 'Isabel II', 18.1492, -65.4423
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='La Palma')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

-- ============================================================
-- Outlying / mid-island
-- ============================================================

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Gracias De Nada', 'Local Puerto Rican', '$$', 'Vieques', 18.1219, -65.4381
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Gracias De Nada')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Mango Taphouse', 'Bar & grill', '$$', 'Vieques', 18.1272, -65.4628
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Mango Taphouse')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','casual');

-- ============================================================
-- ESPERANZA (south malecón) restaurants
-- ============================================================

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Blok Restaurant', 'Contemporary Puerto Rican', '$$$', 'Esperanza', 18.0952, -65.4716
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Blok Restaurant')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('fine-dining','waterfront');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Cafe Del Mar', 'Cafe / waterfront', '$$', 'Esperanza', 18.0952, -65.472
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Cafe Del Mar')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('waterfront','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'El Quenepo', 'Fine dining seafood', '$$$', 'Esperanza', 18.0952, -65.4725
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='El Quenepo')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('fine-dining','seafood','waterfront');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Bili', 'Caribbean / waterfront', '$$', 'Esperanza', 18.0953, -65.4731
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Bili')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('waterfront','seafood');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Bananas', 'Bar & grill', '$$', 'Esperanza', 18.0954, -65.4733
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Bananas')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','waterfront','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Duffy''s', 'Bar & grill', '$$', 'Esperanza', 18.0954, -65.4734
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Duffy''s')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','waterfront','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Lazy Jacks', 'Bar & grill / pizza', '$$', 'Esperanza', 18.0958, -65.4748
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Lazy Jacks')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Kristy''s', 'Local Puerto Rican', '$$', 'Esperanza', 18.0959, -65.475
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Kristy''s')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Trade Winds', 'American / breakfast', '$$', 'Esperanza', 18.096, -65.4756
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Trade Winds')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('breakfast','waterfront','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Rancho Choli', 'Local Puerto Rican', '$$', 'Esperanza', 18.0975, -65.4741
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Rancho Choli')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('local','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Robins Mojito Bar', 'Bar', '$$', 'Vieques', 18.1004, -65.4849
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Robins Mojito Bar')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('bar-grill','casual');

WITH ins AS (
  INSERT INTO restaurant_listings (name, cuisine, price, location_area, latitude, longitude)
  SELECT 'Carambola', 'Fine dining / romantic', '$$$', 'Vieques', 18.0966, -65.4852
  WHERE NOT EXISTS (SELECT 1 FROM restaurant_listings WHERE name='Carambola')
  RETURNING id
)
INSERT INTO restaurant_listing_categories (listing_id, category_id)
SELECT ins.id, c.id FROM ins JOIN restaurant_categories c ON c.slug IN ('fine-dining','waterfront');

COMMIT;
