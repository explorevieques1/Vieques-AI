-- 0005_snorkel_seed.sql
-- Sample self-guided snorkeling spots + proximity zones for testing.
-- Zones are illustrative polygons; refine real coordinates later via a drawing tool.

-- Link spots to beaches where the names match (best-effort).
INSERT INTO snorkel_spots (name, beach_id, description, difficulty, entry_notes, latitude, longitude)
VALUES
  ('Punta Arenas (Green Beach) Snorkel',
   (SELECT id FROM beaches WHERE name ILIKE '%Punta Arenas%' LIMIT 1),
   'Calm, shallow west-end water — excellent beginner snorkeling with seagrass beds and reef patches.',
   'beginner',
   'Wade in from the sandy center of the beach; reef is to the north.',
   18.1517, -65.5856),
  ('Playa Caracas (Red Beach) Snorkel',
   (SELECT id FROM beaches WHERE name ILIKE '%Caracas%' LIMIT 1),
   'Protected cove with rocky edges holding fish and the occasional turtle.',
   'beginner',
   'Enter at the calm center; snorkel along the eastern rocks.',
   18.1018, -65.4458)
ON CONFLICT DO NOTHING;

-- Zones for Punta Arenas
INSERT INTO snorkel_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM snorkel_spots s
CROSS JOIN (VALUES
  ('AVOID', 'hazard', '#dc2626',
   'Boat channel / current — stay out.',
   '{"type":"Polygon","coordinates":[[[-65.5880,18.1545],[-65.5840,18.1548],[-65.5835,18.1532],[-65.5875,18.1530],[-65.5880,18.1545]]]}', 1),
  ('Turtles', 'wildlife', '#22c55e',
   'Seagrass bed — green turtles often feed here. Keep distance.',
   '{"type":"Polygon","coordinates":[[[-65.5895,18.1520],[-65.5875,18.1521],[-65.5878,18.1500],[-65.5898,18.1499],[-65.5895,18.1520]]]}', 2),
  ('Best reef', 'recommended', '#3b82f6',
   'Healthiest coral and most fish — start here.',
   '{"type":"Polygon","coordinates":[[[-65.5870,18.1535],[-65.5855,18.1536],[-65.5856,18.1524],[-65.5871,18.1523],[-65.5870,18.1535]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Punta Arenas (Green Beach) Snorkel';

-- Zones for Caracas
INSERT INTO snorkel_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM snorkel_spots s
CROSS JOIN (VALUES
  ('AVOID', 'hazard', '#dc2626',
   'Rocky shallows with urchins near the east point.',
   '{"type":"Polygon","coordinates":[[[-65.4445,18.1025],[-65.4435,18.1026],[-65.4434,18.1016],[-65.4446,18.1015],[-65.4445,18.1025]]]}', 1),
  ('Fish & reef', 'recommended', '#3b82f6',
   'Eastern rocks hold schools of reef fish.',
   '{"type":"Polygon","coordinates":[[[-65.4462,18.1022],[-65.4450,18.1023],[-65.4451,18.1012],[-65.4463,18.1011],[-65.4462,18.1022]]]}', 2)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Playa Caracas (Red Beach) Snorkel';
