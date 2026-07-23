-- ============================================================
-- 0017_customers.sql
-- Maps each Supabase auth user to their Stripe customer.
-- One row per user; created/updated by the backend during checkout
-- and the Stripe webhook. Writes happen server-side (direct pg
-- connection / service role), so the browser can never forge one.
--
-- Run in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE NOT NULL,
  email              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_stripe ON public.customers(stripe_customer_id);

COMMENT ON TABLE public.customers IS
  'Maps auth.users -> Stripe customer. Written server-side by checkout + webhook.';

-- keep updated_at fresh (reuses touch_updated_at() from 0016)
DROP TRIGGER IF EXISTS trg_customers_touch ON public.customers;
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: user can READ their own mapping only.
-- No INSERT/UPDATE policy on purpose — only the server writes,
-- via the direct Postgres connection which bypasses RLS.
-- ------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own customer read" ON public.customers;
CREATE POLICY "own customer read" ON public.customers
  FOR SELECT USING (auth.uid() = user_id);
