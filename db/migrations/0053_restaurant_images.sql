-- ============================================================================
--  0053_restaurant_images.sql — photos for restaurants
-- ============================================================================
--
--  Restaurants were the only browsable listing type with no photo column, so
--  all 35 rendered the striped placeholder. This gives them the same shape as
--  activity_listings / stay_listings (0013/0027): an ordered text[] of public
--  URLs (first = hero) plus one attribution string.
--
--  Filled from the local admin tool (backend/admin.js → POST
--  /api/admin/:kind/:id/photo), which uploads to the public `place-photos`
--  bucket and appends the URL here.
--
--  Additive and reversible:
--    ALTER TABLE restaurant_listings DROP COLUMN images, DROP COLUMN image_credit;
-- ============================================================================

ALTER TABLE public.restaurant_listings
  ADD COLUMN IF NOT EXISTS images       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_credit text;
