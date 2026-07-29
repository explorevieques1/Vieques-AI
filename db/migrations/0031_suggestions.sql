-- ============================================================
-- 0031_suggestions.sql
-- "Suggestion of the Day" — the arrow button on the mobile greeting
-- card drops one of these on the map as a distinct pin.
--
-- WHY A TABLE AND NOT A QUERY OVER THE CONTENT TABLES
-- ---------------------------------------------------
-- A random beach is not a suggestion. "Go to La Chiva before 10am and
-- you will have a mile of sand to yourself" is. The editorial line is
-- the product here, and it has nowhere to live in beaches/restaurants —
-- those describe a place, not a reason to go today. So: a small curated
-- table that POINTS AT a listing (place_kind + place_ref) and carries
-- its own copy.
--
-- place_ref is deliberately NOT a foreign key. The listing tables have
-- independent id sequences and rows get re-imported (see 0026, 0012), so
-- a hard FK would either block those imports or cascade-delete curated
-- copy. A dangling ref costs one suggestion; a blocked import costs the
-- whole dataset. The route LEFT JOINs and tolerates a miss.
--
-- Applied live to project dbotrrrbqwgzccuiylef via Supabase MCP.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suggestions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL,
  -- The editorial line. This is the whole point of the table.
  blurb        text,
  -- CategorySlug from frontend/src/lib/place.ts — themes the pin colour
  -- and lets the card show which part of the app this belongs to.
  category     text,
  -- Nullable pair: some suggestions are advice with no single pin
  -- ("the ferry books out on Fridays — reserve tonight").
  place_kind   text,
  place_ref    text,
  latitude     double precision,
  longitude    double precision,
  emoji        text NOT NULL DEFAULT '✨',
  -- Lets the card prefer a suggestion that fits the greeting it is sitting
  -- under: no one wants a sunrise tip at 8pm. 'any' always qualifies.
  time_of_day  text NOT NULL DEFAULT 'any'
                 CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'any')),
  -- Crude editorial weighting for the random pick; 2 shows up twice as often.
  weight       int NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Idempotent seeding needs a conflict target, and the title is the natural
-- key — two suggestions with the same title are the same suggestion.
CREATE UNIQUE INDEX IF NOT EXISTS suggestions_title_key
  ON public.suggestions (lower(title));

-- Partial index: every read is "the active ones", and there is no query
-- anywhere that wants the retired copy.
CREATE INDEX IF NOT EXISTS idx_suggestions_active
  ON public.suggestions (time_of_day) WHERE is_active;

-- ------------------------------------------------------------
-- Seed. Coordinates and place_refs are real rows as of this migration
-- (see the note above on why they are not FKs).
-- ------------------------------------------------------------
INSERT INTO public.suggestions
  (title, blurb, category, place_kind, place_ref, latitude, longitude, emoji, time_of_day, weight)
VALUES
  ('Beat the crowd at Blue Beach',
   'La Chiva is the longest stretch of sand on the island and the refuge gate opens at 6am. Get there before 9 and you will have a whole cove to yourself.',
   'beaches', 'beach', '3', 18.1129, -65.3873, '🏖️', 'morning', 2),
  ('Sunrise on Mosquito Pier',
   'A mile of concrete straight out into the channel — the only place on Vieques where you watch the sun come up over water on both sides of you.',
   'beaches', 'beach', '16', 18.1485, -65.5134, '🌅', 'morning', 1),
  ('Breakfast before the beach',
   'Grab coffee and a mallorca on the Esperanza malecón, then walk fifty yards to the sand. The whole morning costs you one parking spot.',
   'restaurants', 'restaurant', '25', 18.0952, -65.4720, '☕', 'morning', 1),
  ('Snorkel the pier pilings',
   'Mosquito Pier''s supports are an accidental reef — parrotfish, rays and the occasional turtle, all in chest-deep water with no boat needed.',
   'activities', 'snorkel', '2', 18.1483, -65.5134, '🤿', 'morning', 2),
  ('Green Beach, before the wind picks up',
   'Punta Arenas faces the mainland and goes glassy early. By afternoon the chop arrives and the visibility halves — this is a morning spot.',
   'activities', 'snorkel', '1', 18.1158, -65.5755, '🐠', 'morning', 1),
  ('Red Beach for an easy afternoon',
   'Playa Caracas has actual shade shelters and calm water, which is the combination you want when the sun is directly overhead.',
   'beaches', 'beach', '2', 18.1084, -65.4130, '⛱️', 'afternoon', 2),
  ('Find Playa Escondida',
   'It is called Hidden Beach for a reason. A short walk off the refuge road buys you a cove most visitors drive straight past.',
   'beaches', 'beach', '12', 18.1014, -65.4283, '🧭', 'afternoon', 1),
  ('Lunch at Bieke''s Bistro',
   'Isabel Segunda''s locals lunch, away from the Esperanza waterfront markup. Go for the daily special rather than the menu.',
   'restaurants', 'restaurant', '13', 18.1471, -65.4411, '🍽️', 'afternoon', 1),
  ('Media Luna with small kids',
   'Half Moon Bay is shallow for a long way out and almost never has surf — the one beach where you can stop watching the water for a minute.',
   'beaches', 'beach', '6', 18.0896, -65.4556, '👶', 'afternoon', 1),
  ('Orchid Beach, the long way round',
   'La Plata is the last stop on the refuge''s east road. Everyone turns back at Blue Beach, which is exactly why you should not.',
   'beaches', 'beach', '4', 18.1176, -65.3760, '🌺', 'afternoon', 1),
  ('Burgers in Isabel Segunda',
   'Burgernauta is a walk-up window with no seating and a line at 7pm. Both of those are recommendations.',
   'restaurants', 'restaurant', '10', 18.1482, -65.4413, '🍔', 'evening', 1),
  ('Sunset on the Esperanza malecón',
   'The whole town walks the seawall at golden hour. Bananas has the west-facing tables — get one an hour early.',
   'restaurants', 'restaurant', '28', 18.0954, -65.4733, '🌇', 'evening', 2),
  ('Dinner at Carambola',
   'Up the hill west of Esperanza, with the island''s best view of the sun going down behind the water. Reserve — it is small.',
   'restaurants', 'restaurant', '35', 18.0966, -65.4852, '🍷', 'evening', 1),
  ('Bio Bay is best on a dark moon',
   'Mosquito Bay is the brightest bioluminescent bay on earth, and moonlight is its only real enemy. Book the nights either side of a new moon.',
   'activities', NULL, NULL, 18.0958, -65.4436, '✨', 'evening', 2),
  ('Coconut Beach at dusk',
   'A short walk west from Esperanza and almost always empty in the evening. Bring water — there is nothing out here.',
   'beaches', 'beach', '18', 18.0966, -65.4795, '🥥', 'evening', 1),
  ('Playa Grande, if you have a 4x4',
   'The road in is the filter. Get past it and the beach is usually yours, but do not attempt it in a rental sedan.',
   'beaches', 'beach', '10', 18.0894, -65.5138, '🚙', 'any', 1),
  ('The wild horses are not a photo op',
   'They roam the whole island and they are genuinely wild. Give them the road, do not feed them, and never get between a mare and her foal.',
   'essentials', NULL, NULL, NULL, NULL, '🐴', 'any', 1),
  ('Cash still runs this island',
   'Plenty of kioskos, food trucks and beach vendors take nothing else, and the ATMs in Isabel Segunda do run dry on holiday weekends.',
   'essentials', NULL, NULL, NULL, NULL, '💵', 'any', 1),
  ('Refuge gates close at sunset',
   'Every beach inside the wildlife refuge — Blue, Red, Orchid, La Plata — locks up at dusk. Getting shut in is a real and expensive mistake.',
   'beaches', NULL, NULL, NULL, NULL, '🚧', 'afternoon', 2),
  ('Book the ferry before you need it',
   'The Ceiba passenger ferry sells out on Fridays and Sundays, and residents get priority. Reserve online days ahead, not the morning of.',
   'transportation', NULL, NULL, NULL, NULL, '⛴️', 'any', 2)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- RLS. Deliberately NOT gated on has_active_entitlement() the way the
-- content tables are in 0019/0022.
--
-- The greeting card is the first thing a signed-in free user sees, and
-- an empty card sells nothing — the same argument PRICING.md §4.1 makes
-- for showing beach pins to the free tier. The suggestion is a taste of
-- the product; the listing it points at is still gated on tap.
-- ------------------------------------------------------------
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suggestions read" ON public.suggestions;
CREATE POLICY "suggestions read" ON public.suggestions
  FOR SELECT TO authenticated USING (is_active);
