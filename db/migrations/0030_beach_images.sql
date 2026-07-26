-- 0030_beach_images.sql
-- Photo column for beaches, mirroring stay_listings.images / image_credit
-- (0027_stays.sql). Same shape on purpose: the detail panel reads one hero
-- photo off the view model regardless of category, so a beach photo and a
-- stay photo have to arrive the same way.
--
-- Values are site-relative paths under frontend/public (e.g.
-- '/images/beaches/playa-negra.jpg') so the asset ships with the frontend
-- build. Absolute URLs also work if a photo later comes from a CDN.

ALTER TABLE beaches
  ADD COLUMN IF NOT EXISTS images       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_credit text;

UPDATE beaches
   SET images = ARRAY['/images/beaches/playa-negra.jpg']
 WHERE name = 'Playa Negra (Black Sand Beach)';
