-- ============================================================
-- 0016_identity.sql
-- Identity layer for Vieques AI: profiles, subscriptions, credits.
-- Designed for Supabase Auth: references auth.users, never stores passwords.
--
-- Run this in the Supabase SQL Editor (it has the auth schema + auth.uid()).
-- Idempotent where practical so re-runs are safe.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES  — app-specific user data, 1:1 with auth.users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  full_name    text,
  trip_start   date,
  trip_end     date,
  preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'App profile, 1:1 with auth.users. Created automatically on signup by trigger.';

-- ------------------------------------------------------------
-- 2. SUBSCRIPTIONS — one row per purchase/plan a user holds
--    Handles BOTH time-limited (traveler, 30 days) and recurring
--    (business monthly) via plan + status + expires_at.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                   text NOT NULL
                           CHECK (plan IN ('traveler','credits','business_basic','business_featured')),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','expired','canceled','past_due')),
  -- time-limited access (traveler = now + 30 days); NULL = no expiry
  expires_at             timestamptz,
  -- Stripe linkage (filled by the webhook)
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_session_id      text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(user_id, status);

COMMENT ON TABLE public.subscriptions IS 'Plans/purchases per user. Written by the Stripe webhook after payment.';

-- ------------------------------------------------------------
-- 3. CREDIT_TRANSACTIONS — append-only ledger for AI credits.
--    Balance is the SUM of amounts (positive = granted, negative = spent).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      integer NOT NULL,            -- +20 on purchase, -1 per AI query
  reason      text NOT NULL,               -- 'purchase', 'ai_query', 'signup_bonus', 'refund'
  ref         text,                        -- optional: stripe session id, chat id, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id);

COMMENT ON TABLE public.credit_transactions IS 'Append-only credit ledger. Never UPDATE/DELETE; balance = SUM(amount).';

-- current balance per user, as a view
CREATE OR REPLACE VIEW public.credit_balances AS
  SELECT user_id, COALESCE(SUM(amount), 0)::integer AS balance
  FROM public.credit_transactions
  GROUP BY user_id;

-- ------------------------------------------------------------
-- 4. AUTO-CREATE PROFILE ON SIGNUP
--    When Supabase inserts into auth.users, make a profiles row.
--    This is what puts data in the DB the moment someone signs up.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'   -- passed from the signup form, optional
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 5. updated_at maintenance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_subs_touch ON public.subscriptions;
CREATE TRIGGER trg_subs_touch BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--    The browser uses the public anon key, so RLS is what stops
--    one user from reading another's data. Users see only their own.
-- ------------------------------------------------------------
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- profiles: a user can read + update their own row
DROP POLICY IF EXISTS "own profile read"   ON public.profiles;
CREATE POLICY "own profile read"   ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- subscriptions: read-only to the user (writes happen server-side via webhook)
DROP POLICY IF EXISTS "own subs read" ON public.subscriptions;
CREATE POLICY "own subs read" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- credits: read-only to the user (writes happen server-side)
DROP POLICY IF EXISTS "own credits read" ON public.credit_transactions;
CREATE POLICY "own credits read" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- NOTE: no INSERT/UPDATE policies for subscriptions/credits on purpose.
-- The Stripe webhook and AI endpoint write with the service-role key,
-- which bypasses RLS. The browser can never fake a purchase or grant itself credits.
