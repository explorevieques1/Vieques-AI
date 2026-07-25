-- ============================================================
-- 0018_fix_credit_balances_rls_bypass.sql
-- SECURITY.md Finding 2: public.credit_balances (0016_identity.sql)
-- ran as the view OWNER's privileges, not the querying user's, so
-- the "own credits read" RLS policy on credit_transactions never
-- applied through it. Combined with anon holding SELECT on the view,
-- every user's balance was readable with just the public anon key.
--
-- Applied live to project dbotrrrbqwgzccuiylef via Supabase MCP on
-- 2026-07-23. This file documents that change in version control.
-- ============================================================

ALTER VIEW public.credit_balances SET (security_invoker = on);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_balances FROM anon, authenticated;
REVOKE SELECT ON public.credit_balances FROM anon;
