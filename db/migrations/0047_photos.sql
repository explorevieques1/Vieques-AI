-- ============================================================
-- 0047_photos.sql
-- One table for every photo in the system, pointing at any listing.
--
-- WHY A TABLE AND NOT MORE images[] COLUMNS
-- -----------------------------------------
-- Three tables carry `images text[] + image_credit` today (0027 stays,
-- 0030 beaches, 0035 activities). That shape has three limits that a
-- field trip's worth of photos hits immediately:
--
--   1. ONE CREDIT FOR N PHOTOS. `image_credit` is a single column on the
--      listing row, so the moment a beach has one photo from the owner
--      and one shot by us, the credit is wrong for one of them. Credit
--      is a property of a photo, not of a place.
--
--   2. NOWHERE FOR CAPTION OR ALT TEXT. A card can show a photo, but a
--      screen reader gets nothing and a gallery gets no captions. alt
--      text is per-photo by definition; it cannot live on the listing.
--
--   3. FIVE TABLES HAVE NO PHOTO COLUMNS AT ALL. restaurant_listings,
--      essential_listings, transport_listings, snorkel_spots and
--      kayak_spots were never given images[]. Adding the pair to each is
--      five more ALTERs and five more places for the shape to drift.
--
-- So: one `photos` table, polymorphic over every listing kind.
--
-- WHY NO photo_categories TABLE
-- -----------------------------
-- A lookup table earns its keep when a category carries data — a label,
-- an icon, a sort order. A photo's category carries none of that; it is
-- purely "which table does place_ref point into". A CHECK-constrained
-- text column expresses that with no join, and `suggestions` (0031)
-- already established exactly this pattern in this schema with its
-- place_kind + place_ref pair. Two polymorphic pointers in one codebase
-- should look the same, so this one is deliberately a copy of that.
--
-- WHY place_ref IS text AND NOT bigint
-- ------------------------------------
-- Nine of the ten listing tables use `bigint GENERATED ALWAYS AS
-- IDENTITY`. `trails` (0025) uses uuid. A bigint column could therefore
-- never point at a trail, and trails are exactly the kind of row that
-- wants a photo. text holds both. This also matches suggestions.place_ref,
-- which is text for the same reason.
--
-- WHY NO FOREIGN KEY
-- ------------------
-- Same reasoning as 0031: a polymorphic ref cannot have one. Beyond that,
-- listing rows get re-imported wholesale (0012 transport, 0026 trails),
-- which reassigns ids — a hard FK would either block those imports or
-- cascade-delete photos we paid a trip to collect. A dangling ref costs
-- one image; a blocked import costs the dataset. Reads LEFT JOIN and
-- tolerate a miss.
--
-- STORAGE, NOT frontend/public
-- ----------------------------
-- 0030 stored site-relative paths under frontend/public because two
-- photos did not justify a bucket. Eighteen do: committing binaries to
-- git bloats history permanently and makes every new photo a redeploy.
-- `url` here holds an absolute Supabase Storage URL, which 0030 already
-- anticipated ("Absolute URLs also work if a photo later comes from a
-- CDN"). storage_path keeps the object key so a delete can find the file.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.photos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- --- what this photo is of ----------------------------------------
  -- The listing kind. CHECK rather than a lookup table, per the header.
  -- Values are table names so the join target is unambiguous: a reader
  -- of this row never has to guess whether 'beach' means `beaches`.
  place_kind   text NOT NULL CHECK (place_kind IN (
                 'beaches',
                 'stay_listings',
                 'activity_listings',
                 'restaurant_listings',
                 'essential_listings',
                 'service_listings',
                 'transport_listings',
                 'snorkel_spots',
                 'kayak_spots',
                 'trails'
               )),
  -- The id of the row in that table, as text so it holds both bigint
  -- ids and trails' uuid. Cast at query time.
  place_ref    text NOT NULL,

  -- --- the file ------------------------------------------------------
  -- Public URL served to the browser. Absolute (Storage/CDN); a
  -- site-relative path still works for anything left in frontend/public.
  url          text NOT NULL,
  -- Object key inside the bucket, e.g. 'beaches/playa-negra-01.jpg'.
  -- NULL for a photo that is not in Storage (the two legacy files).
  -- Needed because deleting a row must also delete the object, and the
  -- key is not reliably recoverable from a CDN URL.
  storage_path text,

  -- --- editorial -----------------------------------------------------
  -- Per-photo, which is the whole reason this table exists.
  caption      text,
  -- Attribution. NULL means none required (our own work).
  credit       text,
  -- Accessibility. Nullable because a photo with no alt is still better
  -- than no photo, but the importer should always try to set it.
  alt_text     text,

  -- --- ordering ------------------------------------------------------
  -- Lowest sort_order is the hero — what place.ts currently gets from
  -- images[0]. Explicit rather than implied by id so reordering a
  -- gallery does not mean re-inserting rows.
  sort_order   int NOT NULL DEFAULT 0,

  -- --- provenance ----------------------------------------------------
  -- Original camera frame ("DSC_0412") and capture date. Kept because
  -- field photos arrive as a flat folder mapped to places by frame
  -- range: when a mapping turns out wrong, this is what lets us find
  -- the real source file instead of re-shooting.
  source_frame text,
  taken_at     timestamptz,

  -- Pixel dimensions, for width/height attributes that stop layout
  -- shift as images load. Nullable: not always known at insert.
  width_px     int,
  height_px    int,

  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
-- The only hot read: "every active photo for this place, hero first".
-- Composite so the detail panel's lookup is one index scan.
CREATE INDEX IF NOT EXISTS idx_photos_place
  ON public.photos (place_kind, place_ref, sort_order)
  WHERE is_active;

-- Re-running an import must update a photo rather than duplicate it.
-- The object key is the natural key: one file, one row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_storage_path
  ON public.photos (storage_path)
  WHERE storage_path IS NOT NULL;

-- ------------------------------------------------------------
-- updated_at trigger, matching the house pattern (0002, 0027, 0035)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.photos_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photos_updated_at ON public.photos;
CREATE TRIGGER trg_photos_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.photos_touch_updated_at();

-- ------------------------------------------------------------
-- RLS — same gate as every other content table (0019)
-- ------------------------------------------------------------
-- Photos are content: they belong behind the paywall exactly as the
-- listings they illustrate do. The backend reads as `postgres` via
-- DATABASE_URL and bypasses RLS; this only constrains anon/authenticated
-- hitting PostgREST directly.
--
-- NOTE: this governs the ROW, not the FILE. An object in a public
-- Storage bucket is reachable by anyone holding its URL regardless of
-- this policy. That is the intended trade for beach scenery — the URLs
-- are unguessable in practice and the images are not the product — but
-- it is a deliberate decision, not an oversight. Anything genuinely
-- sensitive must go in a private bucket with signed URLs instead.
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photos_read_entitled ON public.photos;
CREATE POLICY photos_read_entitled ON public.photos
  FOR SELECT
  TO authenticated
  USING (public.has_active_entitlement());

-- ------------------------------------------------------------
-- Backfill: move the two existing beach photos into the new table
-- ------------------------------------------------------------
-- Kept as frontend/public paths, not Storage URLs — this migration
-- changes the shape, not where those two files live. The import script
-- re-points them when it uploads the real versions.
--
-- images[] and image_credit are deliberately NOT dropped here. place.ts
-- still reads them (place.ts:316, 415, 434); dropping the columns in the
-- same migration that creates their replacement would break the frontend
-- between deploys. A later migration removes them once the read path has
-- moved over.
INSERT INTO public.photos (place_kind, place_ref, url, sort_order, credit)
SELECT 'beaches', b.id::text, b.images[1], 0, b.image_credit
  FROM public.beaches b
 WHERE b.images <> '{}'
   AND NOT EXISTS (
     SELECT 1 FROM public.photos p
      WHERE p.place_kind = 'beaches'
        AND p.place_ref = b.id::text
        AND p.url = b.images[1]
   );

-- ------------------------------------------------------------
-- Comments
-- ------------------------------------------------------------
COMMENT ON TABLE public.photos IS
  'Every photo in the system. Polymorphic over listing tables via '
  'place_kind + place_ref (same pattern as suggestions, 0031). Replaces '
  'the per-table images[] columns from 0027/0030/0035.';
COMMENT ON COLUMN public.photos.place_kind IS
  'Target table name. CHECK-constrained rather than an FK to a '
  'categories table — the value carries no data beyond the join target.';
COMMENT ON COLUMN public.photos.place_ref IS
  'Row id in place_kind''s table, as text because trails.id is uuid '
  'while every other listing id is bigint.';
COMMENT ON COLUMN public.photos.sort_order IS
  'Lowest value is the hero image, replacing images[0].';
COMMENT ON COLUMN public.photos.storage_path IS
  'Object key in the Storage bucket. Required to delete the file when '
  'the row goes; NULL for legacy frontend/public assets.';

INSERT INTO schema_migrations (filename) VALUES ('0047_photos.sql')
ON CONFLICT (filename) DO NOTHING;
