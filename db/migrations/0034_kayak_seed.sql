-- ============================================================================
--  0034_kayak_seed.sql — starter kayak spots + zones
-- ============================================================================
--
--  Mirrors 0005_snorkel_seed.sql. Five real Vieques put-ins covering the range
--  the data model needs to express: a bioluminescent bay under permit rules, a
--  protected family bay, a mangrove system, an open-water crossing, and a
--  refuge beach with a gate curfew.
--
--  COORDINATE ACCURACY — READ BEFORE PUBLISHING
--  --------------------------------------------
--  Spot lat/lng are accurate to roughly the right cove. The ZONE POLYGONS ARE
--  ILLUSTRATIVE — hand-drawn boxes at plausible positions, exactly as 0005's
--  header says of the snorkel zones. That is fine for wiring up and demoing the
--  feature, and NOT fine to ship as safety guidance: a 'hazard' polygon that is
--  200m off tells a paddler open water is safe. Redraw them against real
--  imagery (geojson.io, or the same drawing tool used for snorkel) before this
--  goes in front of paying users.
--
--  Beach links are best-effort by name match, same as 0005 — the SELECT returns
--  NULL where no beach matches, which the nullable FK accepts.
--
--  Idempotent: ON CONFLICT DO NOTHING on spots, and each zone block is guarded
--  by a NOT EXISTS on the spot's existing zones so a re-run does not duplicate
--  polygons (0005 lacks that guard; re-running it doubles its zones).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Spots
-- ---------------------------------------------------------------------------
INSERT INTO kayak_spots
  (name, beach_id, description, difficulty, entry_notes, launch_type, water_type, rental_nearby, latitude, longitude)
VALUES
  ('Mosquito Bay (Bioluminescent Bay)',
   NULL,
   'The brightest bioluminescent bay in the world. Night paddling only, and only with a licensed operator — independent launches are not permitted and the bay is actively patrolled. Sunscreen and bug spray are banned on the water; they kill the dinoflagellates that make the glow.',
   'beginner',
   'No independent launch. Operators stage from the Route 997 access road; you are shuttled in and boats are provided.',
   'ramp', 'bay', true,
   18.0961, -65.4436),

  ('Sun Bay (Balneario Sombe)',
   (SELECT id FROM beaches WHERE name ILIKE '%Sun Bay%' OR name ILIKE '%Sombe%' LIMIT 1),
   'Wide protected crescent with calm water and an easy sand launch — the best beginner paddle on the island and the usual first stop for a rental. Wild horses graze the treeline.',
   'beginner',
   'Carry down from the balneario parking; launch anywhere along the sand. East end is calmest.',
   'beach', 'protected', true,
   18.0971, -65.4634),

  ('Puerto Mosquito Mangrove Channels',
   NULL,
   'Mangrove channels on the western edge of the Puerto Mosquito system. Shallow, sheltered, and thick with juvenile fish and wading birds. Daytime paddle — this is the approach to the bio bay, not the bay itself.',
   'intermediate',
   'Shallow-draft launch off the dirt track; expect to walk the boat out over mud at low tide.',
   'mangrove', 'mangrove', false,
   18.0934, -65.4489),

  ('Esperanza Malecon',
   (SELECT id FROM beaches WHERE name ILIKE '%Esperanza%' LIMIT 1),
   'In-town launch straight off the malecon, with the Cayo Afuera crossing about 600m out. Convenient rather than scenic at the put-in, and the payoff is the reef and the sunset line back.',
   'intermediate',
   'Launch beside the pier. Watch for swimmers and kids jumping off the sugarcane pier.',
   'dock', 'open', true,
   18.0941, -65.4713),

  ('Playa Grande',
   (SELECT id FROM beaches WHERE name ILIKE '%Playa Grande%' LIMIT 1),
   'Long exposed refuge beach on the southwest coast. Open-water paddling with real swell and no services — for confident paddlers with a weather window, not a casual afternoon.',
   'advanced',
   'Dirt road access, then a carry to the sand. Refuge gates close at sunset; be off the water well before.',
   'beach', 'open', false,
   18.0894, -65.5138)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Zones
--
-- One block per spot. The NOT EXISTS guard makes a re-run a no-op rather than a
-- second set of identical polygons.
-- ---------------------------------------------------------------------------

-- Mosquito Bay — the whole point is what you may NOT do here.
INSERT INTO kayak_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM kayak_spots s
CROSS JOIN (VALUES
  ('PERMIT ONLY', 'hazard', '#dc2626',
   'Licensed operators only. Independent kayaks are turned back and fined; the bay is patrolled nightly.',
   '{"type":"Polygon","coordinates":[[[-65.4470,18.0985],[-65.4405,18.0985],[-65.4405,18.0935],[-65.4470,18.0935],[-65.4470,18.0985]]]}', 1),
  ('No sunscreen / no repellent', 'wildlife', '#22c55e',
   'Chemicals kill the dinoflagellates. Rinse off before launching — this is the single biggest threat to the bay.',
   '{"type":"Polygon","coordinates":[[[-65.4465,18.0980],[-65.4410,18.0980],[-65.4410,18.0940],[-65.4465,18.0940],[-65.4465,18.0980]]]}', 2),
  ('Narrow mouth — current', 'hazard', '#dc2626',
   'The channel to the sea runs hard on an outgoing tide. Stay clear unless your guide takes you through.',
   '{"type":"Polygon","coordinates":[[[-65.4408,18.0962],[-65.4388,18.0962],[-65.4388,18.0948],[-65.4408,18.0948],[-65.4408,18.0962]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Mosquito Bay (Bioluminescent Bay)'
  AND NOT EXISTS (SELECT 1 FROM kayak_zones k WHERE k.spot_id = s.id);

-- Sun Bay — a beginner bay, so the zones are mostly "here is the good part".
INSERT INTO kayak_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM kayak_spots s
CROSS JOIN (VALUES
  ('Calm water', 'recommended', '#3b82f6',
   'Protected east end — flat most mornings and the right place to learn.',
   '{"type":"Polygon","coordinates":[[[-65.4620,18.0985],[-65.4585,18.0985],[-65.4585,18.0958],[-65.4620,18.0958],[-65.4620,18.0985]]]}', 1),
  ('AVOID — bay mouth', 'hazard', '#dc2626',
   'Swell and boat traffic build past the headland. Turn back here in anything but flat conditions.',
   '{"type":"Polygon","coordinates":[[[-65.4675,18.0995],[-65.4640,18.0995],[-65.4640,18.0970],[-65.4675,18.0970],[-65.4675,18.0995]]]}', 2),
  ('Swim zone', 'info', '#f59e0b',
   'Balneario swimming area in front of the facilities. Launch to either side of it, not through it.',
   '{"type":"Polygon","coordinates":[[[-65.4650,18.0975],[-65.4625,18.0975],[-65.4625,18.0962],[-65.4650,18.0962],[-65.4650,18.0975]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Sun Bay (Balneario Sombe)'
  AND NOT EXISTS (SELECT 1 FROM kayak_zones k WHERE k.spot_id = s.id);

-- Mangrove channels — wildlife first, then the one place you can get stuck.
INSERT INTO kayak_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM kayak_spots s
CROSS JOIN (VALUES
  ('Bird rookery — keep out', 'wildlife', '#22c55e',
   'Nesting pelicans and herons. Paddling in flushes the birds off the nests; hold to the far bank.',
   '{"type":"Polygon","coordinates":[[[-65.4505,18.0948],[-65.4485,18.0948],[-65.4485,18.0932],[-65.4505,18.0932],[-65.4505,18.0948]]]}', 1),
  ('Mangrove tunnel', 'recommended', '#3b82f6',
   'The good part — a shaded channel through the red mangroves. Duck low and go slowly.',
   '{"type":"Polygon","coordinates":[[[-65.4498,18.0928],[-65.4472,18.0928],[-65.4472,18.0912],[-65.4498,18.0912],[-65.4498,18.0928]]]}', 2),
  ('Dries at low tide', 'hazard', '#dc2626',
   'Mud flat with a few inches at low water. Check the tide or plan on dragging the boat out.',
   '{"type":"Polygon","coordinates":[[[-65.4470,18.0940],[-65.4448,18.0940],[-65.4448,18.0924],[-65.4470,18.0924],[-65.4470,18.0940]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Puerto Mosquito Mangrove Channels'
  AND NOT EXISTS (SELECT 1 FROM kayak_zones k WHERE k.spot_id = s.id);

-- Esperanza — a town launch, so the hazards are boats and people.
INSERT INTO kayak_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM kayak_spots s
CROSS JOIN (VALUES
  ('AVOID — boat channel', 'hazard', '#dc2626',
   'Dive boats and ferries run this line all day. Cross it square and quickly; never linger.',
   '{"type":"Polygon","coordinates":[[[-65.4740,18.0950],[-65.4700,18.0950],[-65.4700,18.0930],[-65.4740,18.0930],[-65.4740,18.0950]]]}', 1),
  ('Cayo Afuera crossing', 'recommended', '#3b82f6',
   'The reason to launch here — reef and turtles off the cay, about 600m out. Go in the morning before the wind.',
   '{"type":"Polygon","coordinates":[[[-65.4775,18.0925],[-65.4740,18.0925],[-65.4740,18.0900],[-65.4775,18.0900],[-65.4775,18.0925]]]}', 2),
  ('Turtles', 'wildlife', '#22c55e',
   'Seagrass off the cay where green turtles feed. Stay above them and do not follow.',
   '{"type":"Polygon","coordinates":[[[-65.4768,18.0918],[-65.4748,18.0918],[-65.4748,18.0904],[-65.4768,18.0904],[-65.4768,18.0918]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Esperanza Malecon'
  AND NOT EXISTS (SELECT 1 FROM kayak_zones k WHERE k.spot_id = s.id);

-- Playa Grande — exposed coast. Everything here is a warning.
INSERT INTO kayak_zones (spot_id, label, zone_type, color, description, area, sort_order)
SELECT s.id, z.label, z.zone_type, z.color, z.description,
       ST_SetSRID(ST_GeomFromGeoJSON(z.geojson), 4326)::geography, z.sort_order
FROM kayak_spots s
CROSS JOIN (VALUES
  ('AVOID — shore break', 'hazard', '#dc2626',
   'Waves dump straight onto the sand. Launching and landing through it is where boats and shoulders get broken.',
   '{"type":"Polygon","coordinates":[[[-65.5165,18.0905],[-65.5110,18.0905],[-65.5110,18.0885],[-65.5165,18.0885],[-65.5165,18.0905]]]}', 1),
  ('Turtle nesting beach', 'wildlife', '#22c55e',
   'Roped nests above the tide line. Do not drag a boat across them and keep dogs leashed.',
   '{"type":"Polygon","coordinates":[[[-65.5170,18.0898],[-65.5105,18.0898],[-65.5105,18.0890],[-65.5170,18.0890],[-65.5170,18.0898]]]}', 2),
  ('Punta Vaca — advanced only', 'hazard', '#dc2626',
   'Rugged point with current and no landing for a long way. Do not round it without a plan and a partner.',
   '{"type":"Polygon","coordinates":[[[-65.5210,18.0888],[-65.5170,18.0888],[-65.5170,18.0860],[-65.5210,18.0860],[-65.5210,18.0888]]]}', 3)
) AS z(label, zone_type, color, description, geojson, sort_order)
WHERE s.name = 'Playa Grande'
  AND NOT EXISTS (SELECT 1 FROM kayak_zones k WHERE k.spot_id = s.id);

COMMIT;
