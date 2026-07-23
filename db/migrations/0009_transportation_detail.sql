-- 0009_transport_detail.sql
-- Distinguish physical vs non-physical transport categories, add a car-rental
-- fleet table, and seed taxi-driver listings (non-physical, shown in a list pane).

-- 1) is_physical drives the frontend: physical -> map pins, non-physical -> list pane
ALTER TABLE transport_categories
  ADD COLUMN IF NOT EXISTS is_physical boolean NOT NULL DEFAULT true;

UPDATE transport_categories SET is_physical = false WHERE slug = 'taxis';
-- all others (car-rental, airlines, ferry, scooter-bike, water-taxi) stay true

-- 2) Fleet table: one row per vehicle a (car rental) listing offers.
CREATE TABLE IF NOT EXISTS transport_vehicles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES transport_listings(id) ON DELETE CASCADE,
  make        text,
  model       text,
  doors       int,
  passengers  int,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transport_vehicles_listing ON transport_vehicles (listing_id);

-- Taxi-specific fields (vehicle_type, passengers, plate) live in the existing
-- transport_listings.metadata JSONB — no schema change needed for those.