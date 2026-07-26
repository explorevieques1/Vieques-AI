-- ============================================================================
--  0028_stay_categories.sql — the chip row for lodging
-- ============================================================================
--
--  0027_stays.sql argued against a category join table ("~6 listings
--  island-wide … promoting property_type to a chip row later is a categories
--  endpoint plus one flag"). This is that later, and it is exactly that: a
--  lookup table, one column, one endpoint.
--
--  A COLUMN, NOT A JOIN TABLE. Restaurants/services/essentials use a
--  {x}_categories + {x}_listing_categories pair because one restaurant is
--  plausibly both "seafood" and "fine dining". A property is one kind of
--  place — a guest house is not also a vacation rental — so the relationship
--  is 1:N and a FK column says so. Nothing to keep in sync, nothing to
--  double-count in the results header.
--
--  `property_type` STAYS. It is free text describing the property ("boutique
--  hotel", "hostel") and it still renders as the panel subtitle; category_slug
--  is the coarser, closed set the chip row navigates by. Collapsing the two
--  would either lose the subtitle's precision or give the chip row five
--  one-item chips.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  Categories — from stays_catagories.csv, same shape as restaurant_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stay_categories (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  label      text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO public.stay_categories (slug, label, sort_order) VALUES
  ('hotels',          'Hotels',          1),
  ('guest-house',     'Guest House',     2),
  ('vacation-rental', 'Vacation Rental', 3),
  ('eco-retreat',     'Eco Retreat',     4)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
--  The listing side
-- ---------------------------------------------------------------------------
--  Nullable on purpose. An unclassified property must still appear in the "All"
--  list — dropping a real hotel off the map because nobody picked its chip yet
--  is a worse failure than showing it without one.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stay_listings
  ADD COLUMN IF NOT EXISTS category_slug text REFERENCES public.stay_categories (slug);

CREATE INDEX IF NOT EXISTS idx_stay_listings_category
  ON public.stay_listings (category_slug);

-- Backfill from the free-text property_type the 0027 seed already carries.
-- `WHERE category_slug IS NULL` so a hand correction made after this migration
-- first ran is not stomped when it is re-applied.
UPDATE public.stay_listings SET category_slug = CASE
    WHEN property_type ILIKE '%eco%'                             THEN 'eco-retreat'
    WHEN property_type ILIKE '%villa%'
      OR property_type ILIKE '%rental%'
      OR property_type ILIKE '%apartment%'                       THEN 'vacation-rental'
    -- Hostels sit with guest houses: both are small, owner-run, room-at-a-time
    -- lodging, and a one-property "Hostel" chip is not worth the panel width.
    WHEN property_type ILIKE '%guest%'
      OR property_type ILIKE '%hostel%'
      OR property_type ILIKE '%b&b%'
      OR property_type ILIKE '%inn%'                             THEN 'guest-house'
    WHEN property_type ILIKE '%hotel%'                           THEN 'hotels'
    ELSE NULL
  END
  WHERE category_slug IS NULL;

-- ---------------------------------------------------------------------------
--  RLS — same policy as every other lookup table (0019_gate_content_rls.sql).
--  The backend connects as the owner and bypasses it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stay_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entitled read" ON public.stay_categories;
CREATE POLICY "entitled read" ON public.stay_categories
  FOR SELECT TO authenticated
  USING (public.has_active_entitlement());

COMMIT;
