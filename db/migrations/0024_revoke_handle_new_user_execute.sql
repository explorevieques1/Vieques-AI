-- ============================================================================
--  0024_revoke_handle_new_user_execute.sql
-- ============================================================================
--
--  SECURITY.md Finding 8 flagged public.handle_new_user() as a SECURITY DEFINER
--  function exposed to anon and authenticated over /rest/v1/rpc/. It was rated
--  low risk on the reasoning that calling it outside a trigger errors anyway —
--  the body dereferences NEW, which is undefined in a standalone call.
--
--  0023 raised the stakes: the function now also inserts a +3 credit grant. The
--  "it errors anyway" argument still holds, but it is an argument about
--  implementation detail rather than a boundary, and it would silently stop
--  holding if anyone ever refactored the function to not touch NEW first.
--
--  It is a trigger function. Nothing should call it as an API. Close it.
--
--  Idempotent: safe to re-run.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
