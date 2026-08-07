-- ============================================================
-- 0043_credit_reservation_idempotency.sql
-- Make an Ask AI credit deduction idempotent per (user, request).
--
-- THE BUG THIS CLOSES
-- -------------------
-- /api/ai/chat used to check the balance in middleware, run the LLM call,
-- and only then write the -1 ledger row. The gap between the check and the
-- write is the full latency of the model — seconds, not milliseconds. Two
-- requests inside that window both read balance 1, both got an answer, and
-- the ledger went negative. A user with 3 free messages could hold several
-- tabs open and spend well past their allowance.
--
-- requireCredits() in backend/middleware.js now RESERVES the credit before
-- the model runs, with the balance test inside the INSERT so concurrent
-- callers cannot both pass. That single statement is atomic on its own.
--
-- This index adds the second half: retry safety. Without a uniqueness
-- constraint, a client that resends the same request (flaky connection,
-- double-tap, an automatic retry) reserves a SECOND credit for work the
-- user only asked for once. The `ref` column already carried a per-request
-- id but nothing enforced it.
--
-- WHY PARTIAL
-- -----------
-- `ref` is NULL for rows that have no natural key — signup grants, manual
-- adjustments. NULLs are never equal to each other in a unique index, so a
-- plain index would technically permit them, but scoping the index WHERE
-- ref IS NOT NULL states the intent and keeps the index small: only rows
-- that actually participate in idempotency are in it.
--
-- THE CATCH, if you ever write a new query against this index
-- ----------------------------------------------------------
-- A partial index can only back an ON CONFLICT clause when the conflict
-- target REPEATS the predicate. This works:
--
--   ON CONFLICT (user_id, ref) WHERE ref IS NOT NULL DO NOTHING
--
-- and this fails at runtime, on every call, with
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification":
--
--   ON CONFLICT (user_id, ref) DO NOTHING
--
-- Both call sites in backend/middleware.js (requireCredits, refundCredit)
-- carry the predicate. Copy it if you add a third.
--
-- SAFE TO RE-RUN. Uses IF NOT EXISTS.
-- ============================================================

-- Existing data check: if any (user_id, ref) pair is already duplicated the
-- CREATE below fails. That is the correct outcome — a duplicate means a
-- credit was double-spent and should be looked at, not indexed over. Run
-- this first to see them:
--
--   SELECT user_id, ref, COUNT(*)
--     FROM public.credit_transactions
--    WHERE ref IS NOT NULL
--    GROUP BY user_id, ref
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_user_ref_uniq
  ON public.credit_transactions (user_id, ref)
  WHERE ref IS NOT NULL;

COMMENT ON INDEX public.credit_tx_user_ref_uniq IS
  'Idempotency guard for credit reservations. Backs the ON CONFLICT (user_id, ref) in requireCredits()/refundCredit(); one ref = one deduction, however many times the client retries.';
