-- ============================================================================
--  0050_account_deletion.sql — self-serve account deletion keeps payment records
-- ============================================================================
--
--  DELETE /api/account (backend/account.js) wipes a user with a single
--  `DELETE FROM auth.users WHERE id = $1`. Every user-owned table in public
--  references auth.users ON DELETE CASCADE, so that one statement already
--  removes profiles, customers, credit_transactions, favorites, itineraries
--  (+ items) and ai_conversations (+ messages). No hand-maintained table list
--  to forget a new table in.
--
--  THE EXCEPTION: PAYMENT RECORDS
--  ------------------------------
--  The privacy policy promises we keep records of completed payments for as
--  long as tax and accounting rules require, even after account deletion. With
--  CASCADE, deleting a buyer erased their fulfillments/subscriptions rows —
--  our only first-party record of the sale.
--
--  So the three money tables switch to ON DELETE SET NULL. Their rows survive
--  with user_id = NULL. None of them stores an email or name (checked against
--  information_schema before writing this), so an orphaned row is an amount,
--  a plan, a date and Stripe ids — anonymous to us, reconcilable with Stripe.
--  `customers` (which DOES hold the email) keeps CASCADE on purpose.
--
--  Every reader of these tables filters on `user_id = $1` or auth.uid(), and
--  NULL never equals anything, so orphaned rows grant no access to anyone.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.fulfillments        ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.subscriptions       ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.ai_credit_purchases ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.fulfillments DROP CONSTRAINT IF EXISTS fulfillments_user_id_fkey;
ALTER TABLE public.fulfillments ADD CONSTRAINT fulfillments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ai_credit_purchases DROP CONSTRAINT IF EXISTS ai_credit_purchases_user_id_fkey;
ALTER TABLE public.ai_credit_purchases ADD CONSTRAINT ai_credit_purchases_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fulfillments.user_id IS
  'NULL = buyer deleted their account (0050). Row kept as an anonymous payment record.';
COMMENT ON COLUMN public.subscriptions.user_id IS
  'NULL = buyer deleted their account (0050). Row kept as an anonymous payment record.';
COMMENT ON COLUMN public.ai_credit_purchases.user_id IS
  'NULL = buyer deleted their account (0050). Row kept as an anonymous payment record.';

COMMIT;
