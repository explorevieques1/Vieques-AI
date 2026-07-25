-- ============================================================================
--  0022_tier_rls.sql — replace the binary paywall with graduated tier access
-- ============================================================================
--
--  WHAT THIS CHANGES
--  -----------------
--  0019_gate_content_rls.sql gated 19 content tables behind
--  has_active_entitlement() — a BINARY check: you either hold an active paid
--  subscription or you see nothing. PRICING.md replaced that with a ladder:
--
--      free (signed in, no purchase) → day_trip → vacation → exploration
--
--  A free user must be able to land in the map app and see pins and beach
--  names. Snorkel zones must require Vacation or better. That is a graduated
--  check, so has_active_entitlement() is no longer the right predicate for
--  content.
--
--  BOTH LAYERS, STILL
--  ------------------
--  0019's real job was closing the direct-PostgREST hole: anyone can lift the
--  anon key out of the JS bundle and query Supabase's REST endpoint straight,
--  bypassing Express entirely. That protection is preserved here — the policies
--  below are simply tier-aware instead of binary. The Express layer gets a
--  matching requireTier() in backend/middleware.js. The two MUST agree; see
--  bestTier() in backend/payments.js, which this function mirrors.
--
--  WHY THERE ARE NO "PREVIEW" VIEWS
--  --------------------------------
--  The free tier sees a COLUMN subset of beaches (name + coords, no facilities
--  or 4x4 data), which RLS cannot express — it filters rows, not columns. The
--  obvious fix is a narrow SECURITY DEFINER view. Deliberately NOT done:
--
--    • The map app never queries PostgREST for content. Every content read
--      goes through backend/server.js, which connects as the table owner over
--      DATABASE_URL and therefore bypasses RLS entirely. Column trimming for
--      the free tier happens there (tierHas(req.tier, 'beach_profiles')).
--    • So a preview view would serve a code path nobody uses, while tripping
--      the exact Supabase advisor rule that caught SECURITY.md Finding 2.
--      Adding known-bad-looking findings to the advisor makes the real ones
--      harder to see.
--
--  Net effect: free users get their preview rows from the API. A free user
--  hitting PostgREST directly gets zero rows, which is correct.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tier rank for the current user. Mirrors bestTier() in payments.js.
--
--    0 = free   (signed in, no active purchase)
--    1 = day_trip
--    2 = vacation
--    3 = exploration
--
--    A user can hold several active rows at once (bought Day Trip, then
--    upgraded to Vacation) — MAX() means the most generous one wins, matching
--    bestTier()'s behaviour exactly.
--
--    Legacy 'traveler' maps to 3: those buyers paid for "unlimited AI + all
--    features" under the old catalog, so downgrading them would be a breach of
--    what they bought.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tier_rank()
RETURNS int
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(MAX(
    CASE s.plan
      WHEN 'exploration' THEN 3
      WHEN 'vacation'    THEN 2
      WHEN 'day_trip'    THEN 1
      WHEN 'traveler'    THEN 3   -- legacy plan: full access, grandfathered
      ELSE 0
    END), 0)
  FROM public.subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now());
$$;

COMMENT ON FUNCTION public.tier_rank() IS
  'Highest active plan rank for auth.uid(): 0 free, 1 day_trip, 2 vacation, 3 exploration. Mirrors bestTier() in backend/payments.js — keep both in sync.';

REVOKE ALL ON FUNCTION public.tier_rank() FROM public;
GRANT EXECUTE ON FUNCTION public.tier_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Re-policy content tables by the minimum tier PRICING.md §4 grants them.
--
--    Rank 1 (Day Trip and up): the core directory. Day Trip buyers get the
--    full island — beaches, restaurants, essentials, transport, activities,
--    services. What they do NOT get is AI and the water content.
--
--    Rank 2 (Vacation and up): snorkel spots and zones. This is the headline
--    upsell from Day Trip to Vacation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- rank 1 — Day Trip and above
      (1, ARRAY[
        'beaches',
        'restaurant_categories', 'restaurant_listings', 'restaurant_listing_categories',
        'essential_categories',  'essential_listings',  'essential_listing_categories',
        'transport_categories',  'transport_listings',  'transport_listing_categories',
        'transport_vehicles',
        'activity_categories',   'activity_listings',   'activity_listing_categories',
        'service_categories',    'service_listings',    'service_listing_categories'
      ]),
      -- rank 2 — Vacation and above
      (2, ARRAY[
        'snorkel_spots', 'snorkel_zones'
      ])
    ) AS v(min_rank, tables)
  LOOP
    FOREACH t IN ARRAY spec.tables
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Drop the binary policy 0019 installed, and any prior run of this one.
      EXECUTE format('DROP POLICY IF EXISTS "entitled read" ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS "tier read" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "tier read" ON public.%I FOR SELECT TO authenticated USING (public.tier_rank() >= %s)',
        t, spec.min_rank
      );
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. has_active_entitlement() stays. It is still the correct predicate for
--    anything strictly paid-only, 0019 documents it, and requireEntitlement()
--    in backend/middleware.js still uses it. Leaving it avoids breaking that
--    contract while the tier system beds in.
-- ---------------------------------------------------------------------------

COMMIT;
