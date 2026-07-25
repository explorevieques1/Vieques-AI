-- ============================================================================
--  0021_pricing_tiers.sql — widen the plan catalog for the three-tier ladder
-- ============================================================================
--
--  WHY THIS IS REQUIRED, NOT OPTIONAL
--  ----------------------------------
--  0016_identity.sql pinned subscriptions.plan to a CHECK constraint listing
--  the four original keys:
--
--      CHECK (plan IN ('traveler','credits','business_basic','business_featured'))
--
--  The new ladder in backend/payments.js introduces day_trip, vacation,
--  exploration, extend and business_partner. Without widening this constraint
--  the failure is the worst possible shape: Stripe Checkout succeeds, the card
--  is charged, and THEN fulfill() throws on the INSERT — so the webhook 500s,
--  Stripe retries, every retry fails, and the customer has paid for nothing.
--
--  Legacy keys are kept so existing rows stay valid. 'traveler' is retired
--  from the catalog but historical purchases must not be invalidated.
--
--  Idempotent: safe to run more than once.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Widen the plan whitelist.
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN (
    -- current traveler ladder
    'day_trip', 'vacation', 'exploration',
    -- add-ons
    'credits', 'extend',
    -- business ladder
    'business_basic', 'business_featured', 'business_partner',
    -- legacy: retired from the catalog, retained so old rows stay valid
    'traveler'
  ));

-- ---------------------------------------------------------------------------
-- 2. The Extend add-on mutates expires_at on an existing row, so the ledger
--    needs a reason code for it that the append-only credit table doesn't
--    cover. Nothing to change structurally — but assert the column exists,
--    because 0016 created it nullable and the extension path depends on
--    "NULL expires_at means open-ended" staying true.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'expires_at'
  ) THEN
    RAISE EXCEPTION 'subscriptions.expires_at is missing — 0016 did not apply';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Entitlement lookups run on every page load of the map app (and now on
--    every gated content route). This is the exact predicate they use.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS subscriptions_active_lookup
  ON public.subscriptions (user_id)
  WHERE status = 'active';

COMMIT;
