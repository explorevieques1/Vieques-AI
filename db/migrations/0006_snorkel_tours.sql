-- 0006_snorkel_tours.sql
-- Add a flag marking whether a snorkel spot has tour operators / guided options.
-- Used by the "Go Yourself" vs "Book a Tour" filter toggle.

ALTER TABLE snorkel_spots
  ADD COLUMN IF NOT EXISTS offers_tours boolean NOT NULL DEFAULT false;

-- seed: mark the sample spots so the toggle has something to filter
UPDATE snorkel_spots SET offers_tours = true
  WHERE name ILIKE '%Caracas%';
