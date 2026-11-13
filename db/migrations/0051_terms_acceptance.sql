-- ============================================================================
--  0051_terms_acceptance.sql — record WHO agreed to WHICH terms, and WHEN
-- ============================================================================
--
--  Sign-up now has an unticked "I am 18+ and agree to the Terms and Privacy
--  Policy" checkbox (landing/src/pages/SignUp.jsx). A checkbox only proves
--  agreement if the agreement is recorded, so the form sends the version it
--  showed (TERMS_VERSION in landing/src/lib/legal.js) in the sign-up
--  metadata, and handle_new_user() writes a row here.
--
--  WHY A SEPARATE TABLE, NOT COLUMNS ON profiles
--  ---------------------------------------------
--  `authenticated` holds table-wide UPDATE on profiles and the "own profile
--  update" policy lets a user edit their own row — so a user could rewrite
--  terms_accepted_at on themselves. This table has RLS on and NO policies and
--  NO grants to anon/authenticated: the browser can neither read nor write it.
--  Only the trigger (SECURITY DEFINER) and the backend (table owner) can.
--
--  Append-only by design: when the terms change, re-acceptance adds a row with
--  the new version rather than overwriting the old one.
--
--  accepted_at comes from the database clock (now()), never from the client.
--  Rows cascade with the user: a deleted account leaves no consent trail.
--
--  Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     text        NOT NULL CHECK (char_length(version) BETWEEN 1 AND 32),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source      text        NOT NULL DEFAULT 'signup'
);

CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx ON public.terms_acceptances (user_id);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.terms_acceptances FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_terms text := left(NEW.raw_user_meta_data->>'terms_version', 32);
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'   -- passed from the signup form, optional
  )
  ON CONFLICT (id) DO NOTHING;

  -- 0051: the sign-up form only submits once the terms box is ticked, and it
  -- sends the version it displayed. Absent = an account created some other
  -- way (dashboard, pre-0051), which correctly records no acceptance.
  IF v_terms IS NOT NULL AND v_terms <> '' THEN
    INSERT INTO public.terms_acceptances (user_id, version, source)
    VALUES (NEW.id, v_terms, 'signup');
  END IF;

  -- No credit grant. New accounts start at a zero balance and must purchase
  -- before Ask AI will answer; requireCredits() in backend/middleware.js turns
  -- a zero balance into a 402 with code 'INSUFFICIENT_CREDITS'.

  RETURN NEW;
END;
$function$;

COMMIT;
