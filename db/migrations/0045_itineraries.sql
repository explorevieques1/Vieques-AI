-- ============================================================
-- 0045_itineraries.sql
-- Trip planner — the Exploration tier's itinerary builder.
--
-- MODELED ON 0032_favorites.sql. Same namespaced place_id, same
-- snapshot jsonb, same per-user RLS. Read that file's header first;
-- the reasoning for those three decisions is identical here and is
-- not repeated.
--
-- WHY snapshot jsonb (short version)
-- ----------------------------------
-- A trip's places span up to ten listing tables. Opening a trip must
-- drop every pin on the map at once, so resolving live would be a
-- ten-way fan-out for a list of six items. The snapshot is the card.
-- It may go stale; tapping a row loads the live record anyway.
--
-- WHY day_index is nullable and unbounded by the trip's dates
-- -----------------------------------------------------------
-- The CHECK below (0..13) is the ABSOLUTE 14-day product cap, NOT the
-- individual trip's current length. Nothing ties an item's day to its
-- trip's date range on purpose: shortening a trip must never delete a
-- user's work. An item left on day 4 of a now-3-day trip keeps
-- day_index = 3 and renders under "Unscheduled"; lengthen the trip and
-- it reappears on day 4 where the user put it. That fallback lives in
-- the UI, not here.
--
-- NULL day_index means "Unscheduled" — also the only bucket a dateless
-- trip has.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.itineraries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  start_date  date,
  end_date    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Both or neither: a start with no end has no day count, and an end
  -- with no start cannot be ordered.
  CONSTRAINT itin_dates_paired
    CHECK ((start_date IS NULL) = (end_date IS NULL)),
  CONSTRAINT itin_dates_ordered
    CHECK (start_date IS NULL OR end_date >= start_date),
  -- 14 days inclusive. 30 day-sections in a 431px map band is unusable.
  CONSTRAINT itin_dates_capped
    CHECK (start_date IS NULL OR end_date - start_date <= 13)
);

CREATE TABLE IF NOT EXISTS public.itinerary_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  place_id      text NOT NULL CHECK (place_id ~ '^[a-z]+:[A-Za-z0-9._-]+$'),
  place_kind    text NOT NULL CHECK (place_kind IN (
                  'beach', 'restaurant', 'stay', 'activity', 'service',
                  'transport', 'essential', 'snorkel', 'kayak', 'trail')),
  place_ref     text NOT NULL,
  day_index     int CHECK (day_index BETWEEN 0 AND 13),
  sort_order    int NOT NULL DEFAULT 0,
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A place appears at most once per trip, so a double-tap cannot
  -- duplicate it and moving days is an UPDATE rather than delete+insert.
  UNIQUE (itinerary_id, place_id)
);

-- The only trip-list read: this user's trips, most recently touched first.
CREATE INDEX IF NOT EXISTS idx_itineraries_user
  ON public.itineraries (user_id, updated_at DESC);

-- The only trip-detail read: one trip's items in render order.
CREATE INDEX IF NOT EXISTS idx_itinerary_items_trip
  ON public.itinerary_items (itinerary_id, day_index NULLS LAST, sort_order);

-- ------------------------------------------------------------
-- RLS. The user owns these rows outright.
--
-- UPDATE *is* granted here, unlike favorites (0032) where a row is only
-- ever created or removed. Renaming a trip, changing its dates, and
-- moving an item between days are all edits.
--
-- itinerary_items has no user_id of its own; ownership is proven by a
-- join to the parent trip. Every policy therefore carries the EXISTS
-- subquery — including USING *and* WITH CHECK on UPDATE, so an item
-- cannot be re-parented into someone else's trip.
-- ------------------------------------------------------------
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own itineraries read" ON public.itineraries;
CREATE POLICY "own itineraries read" ON public.itineraries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries insert" ON public.itineraries;
CREATE POLICY "own itineraries insert" ON public.itineraries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries update" ON public.itineraries;
CREATE POLICY "own itineraries update" ON public.itineraries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own itineraries delete" ON public.itineraries;
CREATE POLICY "own itineraries delete" ON public.itineraries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own items read" ON public.itinerary_items;
CREATE POLICY "own items read" ON public.itinerary_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items insert" ON public.itinerary_items;
CREATE POLICY "own items insert" ON public.itinerary_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items update" ON public.itinerary_items;
CREATE POLICY "own items update" ON public.itinerary_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));

DROP POLICY IF EXISTS "own items delete" ON public.itinerary_items;
CREATE POLICY "own items delete" ON public.itinerary_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.itineraries i
    WHERE i.id = itinerary_id AND i.user_id = auth.uid()));
