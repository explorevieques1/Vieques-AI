-- ============================================================
-- 0019_gate_content_rls.sql
-- Paywall decision: map/directory content (beaches, restaurants,
-- activities, transport, services, essentials, snorkel spots) is the
-- PRODUCT, not marketing. This closes the RLS gap the advisor flagged
-- (23 public tables had RLS disabled) for the 19 tables that back
-- server.js's content routes, and locks down 4 unused/internal tables.
--
-- Two layers, both required:
--   1. backend/middleware.js requireAuth + requireEntitlement on the
--      Express routes (see server.js) — stops normal API callers.
--   2. This migration — stops someone bypassing the API entirely and
--      querying Supabase's PostgREST endpoint directly with the public
--      anon key (same class of bug as Finding 2 / 0018).
--
-- The backend's own reads are unaffected: server.js connects via
-- DATABASE_URL as the `postgres` role (Supabase pooler), which bypasses
-- RLS. Only the anon/authenticated roles used by direct PostgREST/
-- supabase-js calls are restricted here.
--
-- Applied live to project dbotrrrbqwgzccuiylef via Supabase MCP on
-- 2026-07-23. This file documents that change in version control.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Shared entitlement check, mirrors requireEntitlement() in
--    backend/middleware.js exactly so the two layers agree.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_entitlement()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = auth.uid() AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_entitlement() FROM public;
GRANT EXECUTE ON FUNCTION public.has_active_entitlement() TO authenticated;

-- ------------------------------------------------------------
-- 2. Content tables — readable only by an authenticated user with
--    an active plan. Anon (no policy applies to it) gets zero rows.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'beaches',
    'snorkel_spots', 'snorkel_zones',
    'service_categories', 'service_listings', 'service_listing_categories',
    'transport_categories', 'transport_listings', 'transport_listing_categories', 'transport_vehicles',
    'restaurant_categories', 'restaurant_listings', 'restaurant_listing_categories',
    'essential_categories', 'essential_listings', 'essential_listing_categories',
    'activity_categories', 'activity_listings', 'activity_listing_categories'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "entitled read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "entitled read" ON public.%I FOR SELECT TO authenticated USING (public.has_active_entitlement())',
      t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Unused/internal tables the advisor also flagged. Not served by
--    any route — enable RLS with no policies, which fully locks them
--    to anon/authenticated (default-deny) while leaving the
--    service-role/superuser backend connection unaffected.
-- ------------------------------------------------------------
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations   ENABLE ROW LEVEL SECURITY;
