-- ============================================================================
--  0048_remove_free_tier_ai_grant.sql — stop granting 3 free AI messages
-- ============================================================================
--
--  Reverses half of 0023. That migration gave every new account 3 lifetime Ask
--  AI messages so someone could feel the product work before paying. In
--  practice it produced signups that never convert: accounts land, spend the
--  grant or nothing at all, and no purchase follows. The grant is being
--  withdrawn so Ask AI is reachable only by paying.
--
--  Scope is deliberately narrow — this migration changes what happens at
--  SIGNUP and nothing else:
--
--    * handle_new_user() drops the credit INSERT and keeps the profile INSERT
--      verbatim. That trigger is what creates public.profiles, so a mistake
--      here breaks signup entirely; the profile half is copied unchanged from
--      0023 rather than rewritten.
--
--    * Existing balances are LEFT ALONE. Five accounts hold an unspent
--      'signup_bonus' at the time of writing. They signed up under the old
--      terms, credit_transactions is append-only ("Never UPDATE/DELETE;
--      balance = SUM(amount)"), and clawing credits back would mean writing
--      negative offset rows against people who did nothing wrong. Not done.
--
--    * The 'free' TIER still exists in payments.js FEATURES and in 0022's RLS
--      policies. A signed-in non-payer keeps the map preview. Gating the map
--      itself behind payment is a separate, larger change across three
--      enforcement layers and is not attempted here.
--
--  Historical 'signup_bonus' rows are kept as ledger history. Nothing reads
--  reason='signup_bonus' as a flag — the balance is SUM(amount) and does not
--  care why a row exists — so leaving them costs nothing and preserves the
--  audit trail for anyone reconciling old accounts.
--
--  Idempotent: safe to re-run. CREATE OR REPLACE is a full-body swap, so
--  re-running converges on the same function rather than stacking changes.
-- ============================================================================

BEGIN;

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

  -- No credit grant. New accounts start at a zero balance and must purchase
  -- before Ask AI will answer; requireCredits() in backend/middleware.js turns
  -- a zero balance into a 402 with code 'INSUFFICIENT_CREDITS'.

  RETURN NEW;
END;
$function$;

INSERT INTO public.schema_migrations (filename)
VALUES ('0048_remove_free_tier_ai_grant.sql')
ON CONFLICT DO NOTHING;

COMMIT;
