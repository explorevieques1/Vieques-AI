-- ============================================================
-- 0020_subscriptions_session_unique.sql
-- Webhook idempotency race (backend/payments.js fulfill()): the
-- SELECT-then-INSERT duplicate-delivery guard is not atomic, so two
-- concurrent deliveries of the same Stripe checkout.session.completed
-- event (Stripe retries on timeout, and can otherwise redeliver) can
-- both pass the SELECT before either COMMITs, both INSERT, and grant
-- access/credits twice.
--
-- A unique index on stripe_session_id makes the second INSERT fail at
-- the database level regardless of timing; payments.js pairs this with
-- ON CONFLICT (stripe_session_id) DO NOTHING so the duplicate is a
-- silent no-op instead of an unhandled error.
--
-- Applied live to project dbotrrrbqwgzccuiylef via Supabase MCP on
-- 2026-07-23 (no pre-existing duplicate stripe_session_id rows found).
-- This file documents that change in version control.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_session_id_key
  ON public.subscriptions (stripe_session_id);
