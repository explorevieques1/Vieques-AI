-- ============================================================
-- 0042_fulfillments.sql
-- Move webhook idempotency off `subscriptions` and onto its own table.
--
-- THE BUG THIS CLOSES
-- -------------------
-- fulfill() in backend/payments.js wrote a `subscriptions` row for EVERY
-- plan, using the unique index from 0020 as its duplicate-delivery guard.
-- That conflated two unrelated jobs — "has this Stripe session been
-- processed?" and "does this user hold a pass?" — and the add-ons fell
-- through the gap:
--
--   • `credits` ($4.99, 30 AI messages) has no grants.days, so expires_at
--     was NULL. NULL means OPEN-ENDED everywhere it is read, so
--     getEntitlement() reported hasAccess:true forever and requireEntitlement
--     passed. A user bought 30 messages and received PERMANENT paid access
--     for $4.99 instead of $24.99.
--   • `extend` ($4.99, +7 days) did the same, and worse: bought by a user
--     with no active pass it created a phantom permanent row rather than
--     extending anything, because the UPDATE it relies on requires an
--     existing unexpired row.
--
-- Verified in production before this migration: one such `credits` row
-- existed (user ef2a3743…, session cs_test_a1KV9…). All 8 subscription rows
-- were sandbox sessions (cs_test_*), zero live-mode — so no paying customer
-- was affected. That row is deleted at the bottom of this file.
--
-- THE FIX
-- -------
-- `fulfillments` records that a Stripe session was processed, for every plan
-- kind. `subscriptions` goes back to meaning only "this user holds a pass".
-- fulfill() now inserts into fulfillments FIRST and treats rowCount 0 as
-- "already delivered, stop" — so the idempotency guard still lives in a
-- unique index and is still atomic under concurrent retries, but it no
-- longer requires manufacturing a subscription row for an add-on.
--
-- The 0020 index on subscriptions.stripe_session_id STAYS. It is still a
-- correct constraint for access plans (one pass per session) and dropping it
-- would weaken the guarantee during the deploy window when old and new code
-- may both be running.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fulfillments (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The idempotency key. NOT NULL and unique: a Stripe session is fulfilled
  -- exactly once, whatever it bought.
  stripe_session_id  text NOT NULL,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The PLANS key. Deliberately not constrained to a CHECK list: this is an
  -- audit record of what happened, and it must stay writable for a plan key
  -- that has since been retired from the catalog (see 'traveler').
  plan               text NOT NULL,
  -- What the grant actually did, for reconciliation against Stripe:
  --   'access'  → wrote/extended a subscriptions row
  --   'credits' → wrote a credit_transactions row only
  --   'extend'  → mutated an existing subscriptions row only
  --   'noop'    → nothing applied (e.g. extend with no active pass)
  outcome            text NOT NULL,
  -- Cents, as Stripe reported them. Lets you total revenue from this table
  -- without a round trip to the Stripe API.
  amount_total       int,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- THE guard. This index is what makes duplicate webhook delivery safe: the
-- second INSERT loses the race here, in the database, not in application
-- timing. Paired with ON CONFLICT DO NOTHING in fulfill().
CREATE UNIQUE INDEX IF NOT EXISTS fulfillments_stripe_session_id_key
  ON public.fulfillments (stripe_session_id);

-- "What did this user buy?" — the account page and support both want this.
CREATE INDEX IF NOT EXISTS idx_fulfillments_user
  ON public.fulfillments (user_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS: enabled, no policies → deny-all to anon and authenticated.
--
-- Same posture as business_waitlist (0041). This is a financial audit log;
-- the browser has no reason to read it, and getEntitlement() already gives
-- the map app everything it needs. The backend pg pool writes as owner and
-- bypasses RLS, exactly as it does for the entitlement grant itself.
-- ------------------------------------------------------------
ALTER TABLE public.fulfillments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fulfillments FROM anon, authenticated;

-- ------------------------------------------------------------
-- Backfill: reconstruct fulfillment records from the subscription rows that
-- already exist, so redelivery of any historical Stripe event is still a
-- no-op after this deploy. Without this, an old event replayed post-deploy
-- would find no fulfillments row and grant a second time.
--
-- outcome is inferred: rows for the two add-on keys are exactly the bug
-- described above, so they are recorded with the outcome the FIXED code
-- would have produced, not the one that actually happened.
-- ------------------------------------------------------------
INSERT INTO public.fulfillments (stripe_session_id, user_id, plan, outcome, created_at)
SELECT s.stripe_session_id,
       s.user_id,
       s.plan,
       CASE WHEN s.plan IN ('credits') THEN 'credits'
            WHEN s.plan IN ('extend')  THEN 'extend'
            ELSE 'access' END,
       s.created_at
FROM public.subscriptions s
WHERE s.stripe_session_id IS NOT NULL
ON CONFLICT (stripe_session_id) DO NOTHING;

-- ------------------------------------------------------------
-- Clean up the spurious grant.
--
-- Deletes ONLY subscriptions rows for the two add-on plans. Those rows are
-- never legitimate: neither add-on confers a pass in its own right, and the
-- credits they bought live in credit_transactions, which this does not
-- touch. The user keeps every credit and every real pass.
--
-- Safe to re-run, and a no-op on any database where the fixed fulfill() has
-- always been in place.
-- ------------------------------------------------------------
DELETE FROM public.subscriptions
 WHERE plan IN ('credits', 'extend');
