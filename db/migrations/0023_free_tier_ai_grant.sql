-- ============================================================================
--  0023_free_tier_ai_grant.sql — 3 lifetime Ask AI messages for every account
-- ============================================================================
--
--  PRICING.md §4 gives the free tier "3 AI messages, lifetime". Lifetime, not
--  per-session and not per-month: the point is to let someone feel the product
--  work before paying, not to provide a renewable free allowance.
--
--  "Lifetime" falls out of the ledger design for free. credit_transactions is
--  append-only and the balance is SUM(amount), so one +3 row at signup plus a
--  -1 row per query self-limits with no reset logic, no cron, and no extra
--  state to keep consistent.
--
--  Two halves, both required:
--    1. Extend handle_new_user() so future signups get the grant. That trigger
--       fires once per auth.users INSERT, so it is idempotent by construction.
--    2. Backfill every existing user, guarded on ref = 'free_tier' so re-running
--       this migration cannot double-grant.
--
--  The ref column is what makes the backfill safe to repeat — it is the
--  idempotency key, exactly as stripe_session_id is for purchases.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Future signups. Preserves the existing profile insert verbatim — this
--    trigger is what creates public.profiles, so a mistake here breaks signup
--    entirely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'   -- passed from the signup form, optional
  )
  ON CONFLICT (id) DO NOTHING;

  -- Free-tier Ask AI allowance. See PRICING.md §4. Guarded on ref so a replayed
  -- trigger (or a re-run of this migration's backfill) can never double-grant.
  INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
  SELECT NEW.id, 3, 'signup_bonus', 'free_tier'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = NEW.id AND ref = 'free_tier'
  );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Backfill existing accounts, so users who signed up before this migration
--    are not stranded with a zero balance and no way to try the assistant.
-- ---------------------------------------------------------------------------
INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
SELECT u.id, 3, 'signup_bonus', 'free_tier'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_transactions c
  WHERE c.user_id = u.id AND c.ref = 'free_tier'
);

COMMIT;
