-- ============================================================
-- 0041_business_waitlist.sql
-- Capture business-owner interest while the business PRODUCT does not exist.
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- backend/payments.js still defines business_basic / business_featured /
-- business_partner, and Stripe will happily charge $19–$149 a month for
-- them. But nothing delivers them: there is no claim flow, no business
-- dashboard, no analytics, and — the sharp edge — the tiers those plans
-- declare ('basic', 'featured', 'partner') have no entry in the FEATURES
-- table, so bestTier() resolves a paying business subscriber all the way
-- back down to 'free'. They would pay monthly and receive the free tier.
--
-- So the pricing page stops selling those plans and collects an email
-- instead. This table is where that email lands. When the dashboard ships,
-- this list is the launch audience.
--
-- WHY IT IS NOT GATED ON auth.uid()
-- ---------------------------------
-- Unlike favorites (0032), the person signing up is almost never logged in
-- — they are a restaurant owner who found the marketing site, not a user.
-- So there is no auth.uid() to key on and no useful RLS policy to write.
-- Instead RLS is enabled with NO policy at all, which denies every
-- anon/authenticated request outright. The only writer is the backend's
-- direct pg pool, which connects as the table owner and bypasses RLS
-- (same mechanism payments.js relies on for the entitlement grant).
--
-- That is deliberate: an anon INSERT policy would let anyone spam this
-- table straight through PostgREST, skipping the rate limit on the API
-- route. Keeping the write server-side keeps the rate limit meaningful.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.business_waitlist (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  -- Everything below is optional. The form asks for email and (optionally)
  -- the business name; a required field here would cost signups for data
  -- we can collect later in the onboarding conversation.
  business_name text,
  -- Free-typed, not a FK to any category table. At this stage we are
  -- learning what kinds of businesses want in — constraining it to today's
  -- taxonomy would throw away exactly the signal we want.
  business_type text,
  note          text,
  -- Which plan they clicked before landing here, when they came from a
  -- specific card. Tells us what the tiers should actually cost.
  interested_in text,
  -- Set once outreach happens, so the launch mailout can skip them.
  contacted_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per business. A second submission updates the existing row
-- rather than creating a duplicate — see the ON CONFLICT in the API route.
-- Lower-cased because "Maria@..." and "maria@..." are the same inbox.
CREATE UNIQUE INDEX IF NOT EXISTS business_waitlist_email_key
  ON public.business_waitlist (lower(email));

-- The only read query is "who hasn't been contacted yet, oldest first".
CREATE INDEX IF NOT EXISTS idx_business_waitlist_pending
  ON public.business_waitlist (created_at) WHERE contacted_at IS NULL;

-- ------------------------------------------------------------
-- RLS: enabled, with zero policies. This is not an oversight.
--
-- In Postgres, RLS with no matching policy denies the row to every role
-- except the table owner and roles with BYPASSRLS. So:
--   • the browser's anon key       → denied (cannot read or write)
--   • an authenticated user's JWT  → denied
--   • the backend's pg pool (owner)→ allowed
--
-- This list contains business contact details we solicited. It should not
-- be readable by the anon key under any circumstances, and unlike the
-- content tables there is no free-tier preview argument for exposing it.
-- ------------------------------------------------------------
ALTER TABLE public.business_waitlist ENABLE ROW LEVEL SECURITY;

-- Belt and braces: revoke the default grants PostgREST's roles inherit, so
-- the table is unreachable through the Supabase REST API even if a future
-- migration adds a permissive policy by accident.
REVOKE ALL ON public.business_waitlist FROM anon, authenticated;
