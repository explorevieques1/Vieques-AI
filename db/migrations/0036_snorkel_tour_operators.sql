-- 0036_snorkel_tour_operators.sql
-- Contact details for snorkeling, and the companies behind "Book a Tour".
--
-- Two things happen here, and they are deliberately separate:
--
--   1. snorkel_spots gains phone / email / website. Some spots really do have
--      a contact — a beach concession, a park office — and the detail sheet
--      had nowhere to put it.
--
--   2. snorkel_tour_operators is a NEW table for the companies. They are not
--      spots. A snorkel_spot is a place with a lat/lng, a beach_id and
--      polygonal hazard zones; "Fun Brothers" is a phone number that picks you
--      up. Putting operators in snorkel_spots would either drop a pin on the
--      map at an address that means nothing to a visitor, or — because
--      /api/snorkel-spots filters `latitude IS NOT NULL` (backend/server.js)
--      — insert eight rows the app can never display.
--
-- The link table lets one operator serve many spots and one spot list many
-- operators, which is the actual shape of the island: most of these companies
-- will run trips to several reefs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. contact columns on the spots themselves
-- ---------------------------------------------------------------------------
ALTER TABLE snorkel_spots
  ADD COLUMN IF NOT EXISTS phone   text,
  ADD COLUMN IF NOT EXISTS email   text,
  ADD COLUMN IF NOT EXISTS website text;

-- ---------------------------------------------------------------------------
-- 2. the operators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS snorkel_tour_operators (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  phone         text,
  email         text,
  website       text,
  description   text,          -- what the company is / who it suits
  tour_details  text,          -- what the trip actually includes
  duration      text,          -- e.g. "3 hours", "half day"
  price_info    text,          -- free text: rates change and vary by season
  departure     text,          -- where you meet them
  booking_notes text,          -- deposits, cancellation, what to bring
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE on name above is what makes the seed's ON CONFLICT re-runnable.
-- activity_listings has no such constraint, which is why the bio bay seed had
-- to fall back to NOT EXISTS — see db/seeds/biobay_tours_seed.sql.

-- Which operators serve which spots. Both sides cascade: deleting a spot
-- should not leave dangling links, and neither should retiring a company.
CREATE TABLE IF NOT EXISTS snorkel_spot_operators (
  spot_id     bigint NOT NULL REFERENCES snorkel_spots(id) ON DELETE CASCADE,
  operator_id bigint NOT NULL REFERENCES snorkel_tour_operators(id) ON DELETE CASCADE,
  PRIMARY KEY (spot_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_snorkel_spot_operators_operator
  ON snorkel_spot_operators (operator_id);
-- No index on spot_id: the primary key already leads with it.

-- Same updated_at bookkeeping the spots trigger does, minus the geom half —
-- operators have no coordinates.
CREATE OR REPLACE FUNCTION snorkel_tour_operators_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snorkel_tour_operators_touch ON snorkel_tour_operators;
CREATE TRIGGER trg_snorkel_tour_operators_touch
  BEFORE UPDATE ON snorkel_tour_operators
  FOR EACH ROW EXECUTE FUNCTION snorkel_tour_operators_touch();

COMMIT;
