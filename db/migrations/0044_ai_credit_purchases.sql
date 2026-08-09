-- ============================================================
-- 0044_ai_credit_purchases.sql
-- A user-readable purchase history for AI credit packs.
--
-- WHY THIS TABLE EXISTS WHEN THREE OTHERS ALREADY TOUCH A CREDIT PURCHASE
-- ----------------------------------------------------------------------
-- Buying the $4.99 pack already writes two rows, and neither one can answer
-- "show me my purchase history" from the browser:
--
--   • fulfillments (0042) records that the Stripe session was processed, with
--     the amount in cents. It is the idempotency guard and a financial audit
--     log, so it is RLS-deny-all with REVOKE ALL FROM anon, authenticated —
--     the frontend cannot read it, deliberately. It also mixes every plan
--     kind together: passes, extensions, and credit packs in one stream.
--   • credit_transactions (0016) records the +30 grant. It is user-readable,
--     but it is a BALANCE ledger, not a receipt: it carries no price, no
--     payment status, and it is dominated by -1 ai_query rows. Reading a
--     purchase history out of it means filtering reason='purchase' and then
--     having no idea what was paid.
--
-- Neither can ever hold a DENIED payment, which is the other half of the ask.
-- A failed card never reaches fulfill() and never grants a credit, so by
-- construction it leaves no trace in either table.
--
-- This table is the receipt: one row per attempted AI-credit purchase,
-- carrying credits + price + payment status, readable by its owner, and
-- scoped to AI spending only so the history stays legible.
--
-- SCOPE. AI credit packs only — PLANS entries whose grants.type is 'credits'.
-- Access passes stay in subscriptions; every plan kind stays in fulfillments.
-- This table intentionally duplicates a little of both, because it answers a
-- different question than either and has a different audience (the user).
--
-- NOT THE SOURCE OF TRUTH FOR BALANCE. credit_transactions still is. A row
-- here with status='confirmed' has a matching ledger row; a row with any
-- other status has none, and must never be summed into a balance.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_credit_purchases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ---- What Stripe calls this attempt ----------------------------------
  -- The Checkout session. Unique: one purchase row per session, which is what
  -- makes the webhook's UPSERT idempotent under Stripe's at-least-once
  -- delivery. NOT NULL — every row here originates from a checkout.
  stripe_session_id  text NOT NULL,
  -- The PaymentIntent. Null until Stripe attaches one (and on sessions that
  -- expire before payment is attempted). Recorded because the failure events
  -- key on it, and because it is what Stripe support asks for.
  stripe_payment_intent_id text,

  -- ---- What was bought -------------------------------------------------
  -- The PLANS key, e.g. 'credits'. Not CHECK-constrained, matching the
  -- reasoning in 0042: this is an audit record and must stay writable for a
  -- plan key that has since been retired from the catalog.
  plan               text NOT NULL,
  -- Ask AI messages this pack grants. Mirrors PLANS[plan].grants.amount at
  -- the time of purchase, so changing the pack size later does not rewrite
  -- history. Denormalized on purpose.
  credits            integer NOT NULL,

  -- ---- What it cost ----------------------------------------------------
  -- CENTS, as Stripe reported them (499 = $4.99). Integer, never float:
  -- money in a floating-point type eventually rounds wrong.
  amount_cents       integer NOT NULL,
  currency           text NOT NULL DEFAULT 'usd',

  -- ---- Payment state ---------------------------------------------------
  --   'pending'   → checkout opened, no result yet (async payment methods)
  --   'confirmed' → paid; the credits ARE in credit_transactions
  --   'denied'    → card declined / payment failed; nothing granted
  --   'expired'   → session abandoned or timed out; nothing granted
  --   'refunded'  → reversed after the fact; see the note on balance above
  -- CHECK-constrained because unlike `plan`, this vocabulary is ours and a
  -- typo here would silently corrupt every history query that filters on it.
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','confirmed','denied','expired','refunded')),
  -- Stripe's own explanation when status is 'denied' (decline code / message).
  -- Free text: Stripe adds new decline reasons and we want them recorded, not
  -- rejected. Shown to support, not necessarily to the user.
  failure_reason     text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credit_purchases IS
  'User-facing receipt history for AI credit packs: credits, price, and payment status per Stripe checkout. Written server-side by the Stripe webhook only. Balance still comes from credit_transactions.';

COMMENT ON COLUMN public.ai_credit_purchases.amount_cents IS
  'Price in CENTS as Stripe reported it (499 = $4.99). Never store money as float.';
COMMENT ON COLUMN public.ai_credit_purchases.status IS
  'confirmed = credits granted in credit_transactions. Any other value means nothing was granted; never sum these into a balance.';

-- The idempotency key. Stripe redelivers webhooks, and a session moves through
-- several events (completed, async_payment_failed, expired) that all target
-- the SAME row. Unique on session id means those are UPSERTs, not duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_purchases_session_uniq
  ON public.ai_credit_purchases (stripe_session_id);

-- "Show me my purchase history, newest first" — the one query the UI runs.
CREATE INDEX IF NOT EXISTS idx_ai_credit_purchases_user
  ON public.ai_credit_purchases (user_id, created_at DESC);

-- The failure webhooks arrive keyed on the PaymentIntent, not the session, so
-- they need this to find the row. Partial: nulls never participate in lookups.
CREATE INDEX IF NOT EXISTS idx_ai_credit_purchases_pi
  ON public.ai_credit_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- keep updated_at fresh (reuses touch_updated_at() from 0016)
DROP TRIGGER IF EXISTS trg_ai_credit_purchases_touch ON public.ai_credit_purchases;
CREATE TRIGGER trg_ai_credit_purchases_touch BEFORE UPDATE ON public.ai_credit_purchases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
--
-- Read-only to the owner, matching subscriptions and credit_transactions
-- (0016). This is the difference from fulfillments: this table was BUILT to
-- be shown to the user, so it carries only what they may see — their own
-- credits, price, and status. No INSERT/UPDATE/DELETE policy on purpose: the
-- webhook writes over the pg pool as owner and bypasses RLS, so the browser
-- can never invent a purchase or flip one to 'confirmed'.
-- ------------------------------------------------------------
ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ai credit purchases read" ON public.ai_credit_purchases;
CREATE POLICY "own ai credit purchases read" ON public.ai_credit_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- Belt and braces: RLS governs row visibility, these govern verbs. Even if a
-- future policy is added carelessly, the browser holds no write grant.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_credit_purchases FROM anon, authenticated;
GRANT SELECT ON public.ai_credit_purchases TO authenticated;
-- anon gets nothing: an unauthenticated visitor has no purchases by definition.
REVOKE ALL ON public.ai_credit_purchases FROM anon;

-- ------------------------------------------------------------
-- BACKFILL — reconstruct history for credit packs already sold.
--
-- Everything in fulfillments with outcome='credits' was a completed AI credit
-- purchase, so it is 'confirmed' by definition: those rows only exist because
-- fulfill() committed, and that same transaction wrote the ledger grant.
--
-- `credits` is read from the matching credit_transactions row rather than
-- hardcoded, so a pack whose size differed historically backfills at the size
-- actually granted. The join is on ref = stripe_session_id, which is exactly
-- how fulfill() links them.
--
-- amount_cents falls back to 499 only when fulfillments predates the
-- amount_total column being populated (the 0042 backfill left it NULL). That
-- is the only price an AI credit pack has ever had.
--
-- Safe to re-run: ON CONFLICT DO NOTHING against the unique session index.
-- ------------------------------------------------------------
INSERT INTO public.ai_credit_purchases
  (user_id, stripe_session_id, plan, credits, amount_cents, status, created_at, updated_at)
SELECT f.user_id,
       f.stripe_session_id,
       f.plan,
       COALESCE(ct.amount, 30),
       COALESCE(f.amount_total, 499),
       'confirmed',
       f.created_at,
       f.created_at
FROM public.fulfillments f
LEFT JOIN public.credit_transactions ct
       ON ct.ref = f.stripe_session_id
      AND ct.user_id = f.user_id
      AND ct.reason = 'purchase'
WHERE f.outcome = 'credits'
ON CONFLICT (stripe_session_id) DO NOTHING;
