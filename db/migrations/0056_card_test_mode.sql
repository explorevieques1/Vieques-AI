-- ============================================================================
--  0056_card_test_mode.sql — test cards that only testers can see
-- ============================================================================
--
--  The owner builds and tests the Cards UI from off the island, so a card has
--  to be placeable anywhere (e.g. next to the owner's desk) without any
--  customer ever seeing it.
--
--  A card with test_only = true:
--    * is filtered out of GET /api/cards, /nearby, /solve and /claim for
--      everyone whose user id isn't in the backend's CARD_TESTER_IDS env var;
--    * may sit outside Vieques (the admin tool skips its coordinate box for
--      it, and testers skip the island fence in backend/cards.js).
--
--  Enforced in backend/cards.js, not here (the catalog is backend-only; RLS
--  already keeps anon/authenticated out of collectible_cards).
--
--  Achievements get the same flag: a test badge is listed and awarded only
--  to testers, so customers never see "test x2" in their badge list.
--
--  Additive and reversible:
--    ALTER TABLE collectible_cards DROP COLUMN test_only;
--    ALTER TABLE achievements      DROP COLUMN test_only;
-- ============================================================================

ALTER TABLE public.collectible_cards
  ADD COLUMN IF NOT EXISTS test_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS test_only boolean NOT NULL DEFAULT false;
