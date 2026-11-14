-- ============================================================================
--  0052_featured_placements.sql — paid sponsorship of the "Top" lists
-- ============================================================================
--
--  Restaurants, stays (vacation rentals / Airbnb-style) and tours (activity
--  listings) each open on a "Top" list of 5. A business can pay to hold one of
--  those 5 slots for a period. This table is the booking ledger for that.
--
--  HOW THE TOP LIST IS BUILT (backend/featured.js)
--  -----------------------------------------------
--    1. Sponsored: placements with status 'active' whose [starts_at, ends_at)
--       covers now(), in slot order (1 = first).
--    2. Then filled to 5 from editorial ranking: metadata->>'top_rank', then name.
--  Sponsored rows are returned with `sponsored: true` and the app labels them
--  "Sponsored" — paid placement must be disclosed (FTC), and the label is also
--  what keeps the unpaid ranking trustworthy.
--
--  BOOKING A SPONSOR (until there is a checkout for it)
--  ----------------------------------------------------
--    INSERT INTO featured_placements
--      (listing_kind, listing_id, slot, starts_at, ends_at, status,
--       sponsor_name, sponsor_email, price_cents)
--    VALUES ('restaurant', 12, 1, '2026-12-01', '2027-01-01', 'active',
--            'Bananas', 'owner@example.com', 15000);
--  Use 'pending' until paid, then flip to 'active'. Cancel with
--  status = 'cancelled' (frees the slot) rather than deleting — the row is
--  also the record of what was sold.
--
--  GUARANTEES THE DATABASE ENFORCES
--  --------------------------------
--   - One sponsor per slot per type at any moment, and one slot per listing at
--     any moment (exclusion constraints over the time range; cancelled rows
--     don't count). Double-selling a slot fails at INSERT.
--   - listing_id must exist, and be active, in the table its kind names
--     (trigger — a polymorphic id can't carry a real FK).
--
--  PRIVACY: sponsor_email / price are business data. RLS on, no policies, no
--  grants to anon/authenticated — only the backend (table owner) reads it, and
--  it only ever sends listing ids + slot to the browser.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.featured_placements (
  id                       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_kind             text        NOT NULL CHECK (listing_kind IN ('restaurant', 'stay', 'activity')),
  listing_id               bigint      NOT NULL,
  slot                     smallint    NOT NULL CHECK (slot BETWEEN 1 AND 5),
  starts_at                timestamptz NOT NULL DEFAULT now(),
  ends_at                  timestamptz NOT NULL,
  status                   text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'active', 'cancelled')),
  sponsor_name             text        NOT NULL,
  sponsor_email            text,
  price_cents              integer     CHECK (price_cents >= 0),
  currency                 text        NOT NULL DEFAULT 'usd',
  stripe_payment_intent_id text,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT featured_placements_period CHECK (ends_at > starts_at),
  -- No two live bookings of the same slot overlap in time.
  CONSTRAINT featured_placements_one_sponsor_per_slot EXCLUDE USING gist (
    listing_kind WITH =, slot WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled'),
  -- A listing can't hold two slots of the same list at once.
  CONSTRAINT featured_placements_one_slot_per_listing EXCLUDE USING gist (
    listing_kind WITH =, listing_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX IF NOT EXISTS featured_placements_live_idx
  ON public.featured_placements (listing_kind, status, starts_at, ends_at);

COMMENT ON TABLE public.featured_placements IS
  'Paid "Top" list slots (5 per kind). Booking ledger — cancel, never delete. See 0052 header.';

-- The listing must exist and be active in the table its kind names.
CREATE OR REPLACE FUNCTION public.featured_placements_check_listing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  ok boolean;
BEGIN
  IF NEW.listing_kind = 'restaurant' THEN
    SELECT EXISTS (SELECT 1 FROM restaurant_listings WHERE id = NEW.listing_id AND is_active) INTO ok;
  ELSIF NEW.listing_kind = 'stay' THEN
    SELECT EXISTS (SELECT 1 FROM stay_listings WHERE id = NEW.listing_id AND is_active) INTO ok;
  ELSE
    SELECT EXISTS (SELECT 1 FROM activity_listings WHERE id = NEW.listing_id AND is_active) INTO ok;
  END IF;
  -- Only enforce on rows that can show up; a cancelled booking may outlive its listing.
  IF NOT ok AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'featured_placements: no active % listing with id %', NEW.listing_kind, NEW.listing_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS featured_placements_check_listing ON public.featured_placements;
CREATE TRIGGER featured_placements_check_listing
  BEFORE INSERT OR UPDATE ON public.featured_placements
  FOR EACH ROW EXECUTE FUNCTION public.featured_placements_check_listing();

ALTER TABLE public.featured_placements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.featured_placements FROM anon, authenticated;

COMMIT;
