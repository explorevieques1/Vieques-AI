-- ============================================================================
--  0049_remove_free_tier.sql — the map is paid-only; free tier is gone
-- ============================================================================
--
--  0023 gave every account 3 AI messages; 0048 stopped that. This finishes the
--  job: a signed-in account with no purchase now gets NOTHING. The map itself
--  requires at minimum a Day Trip pass. Signing up is identity, not access.
--
--  WHY THIS MIGRATION BARELY TOUCHES THE DATABASE
--  ---------------------------------------------
--  The free tier was never a database concept. 0022 already policies every
--  content table at `tier_rank() >= 1`, and rank 0 (no active subscription)
--  has always read zero rows through PostgREST. stay_listings, stay_categories,
--  trails and photos sit behind has_active_entitlement(), which is likewise
--  paid-only. Verified against pg_policies before writing this: 17 tables at
--  rank >= 1, 4 at rank >= 2, 4 on has_active_entitlement(), none at rank 0.
--
--  The leak was entirely in Express. backend/server.js connects as the table
--  OWNER over DATABASE_URL and therefore bypasses RLS, so free access was a
--  property of the FEATURES map in backend/payments.js — which listed
--  ['map', 'search', 'beach_names', 'restaurant_preview', 'stay_preview',
--  'ai_trial'] for 'free' — and not of any policy here. That list is now empty,
--  which is what actually closes the hole. See the companion changes in
--  payments.js, middleware.js, AccessGate.tsx and api.ts.
--
--  So this file only corrects documentation that 0049 makes wrong, and records
--  itself as applied. No policy is altered, because none needs to be.
--
--  EXISTING NON-PAYING ACCOUNTS
--  ----------------------------
--  Five accounts hold a pre-0048 signup bonus and no pass. Their credits are
--  left in the ledger (append-only; see 0048's header), but they can no longer
--  reach the map or spend those credits — requireCredits() now demands an
--  active pass as well as a balance. The rows are inert history, not access.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- tier_rank() is unchanged in BEHAVIOUR — 0 still means "no active purchase"
-- and MAX() still picks the most generous pass. Only the comment changes: it
-- described 0 as "free", a tier that granted map access. It now grants nothing,
-- and the next person reading this function should not infer otherwise.
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.tier_rank() IS
  'Highest active plan rank for auth.uid(): 0 = no active pass (NO access — the free tier was removed in 0049), 1 day_trip, 2 vacation, 3 exploration. Mirrors bestTier() in backend/payments.js — keep both in sync.';

INSERT INTO public.schema_migrations (filename)
VALUES ('0049_remove_free_tier.sql')
ON CONFLICT DO NOTHING;

COMMIT;
