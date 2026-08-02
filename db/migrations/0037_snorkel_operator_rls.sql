-- 0037_snorkel_operator_rls.sql
-- Tier policies for the tables 0036 added.
--
-- SUPERSEDED BY 0038. Both tables this file policies are dropped there, so on a
-- fresh database every statement below is a no-op — hence the table_exists
-- guard wrapping them. Kept rather than deleted because migrations are history:
-- a database that ran 0036 and 0037 before 0038 existed needs this file to stay
-- in the sequence for its own record to make sense.
--
-- 0036 created snorkel_tour_operators and snorkel_spot_operators without
-- policies. Supabase enables RLS on new public tables by default, so both sat
-- deny-all for `authenticated` — invisible to any direct PostgREST/supabase-js
-- read. The API never noticed because backend/server.js connects as the pooler
-- superuser, which bypasses RLS entirely; the gap would only have shown up the
-- first time something queried these tables from the client.
--
-- Operators are the "Book a Tour" half of a Vacation-tier feature, so they read
-- at the same rank as the spots and zones they sit beside — see the `tier read`
-- policies in 0022_tier_rls.sql.

BEGIN;

-- The guard: skip entirely when 0038 has already removed these tables, or when
-- this runs on a fresh database where 0036 and 0038 both applied before it.
-- The join table gates on the same rank rather than on the operator row: a
-- bare (spot_id, operator_id) pair is meaningless without one of its ends,
-- both of which are already rank-2 reads.
DO $$
BEGIN
  IF to_regclass('public.snorkel_tour_operators') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE snorkel_tour_operators ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tier read" ON snorkel_tour_operators';
    EXECUTE 'CREATE POLICY "tier read" ON snorkel_tour_operators
               FOR SELECT TO authenticated USING (tier_rank() >= 2)';
  END IF;

  IF to_regclass('public.snorkel_spot_operators') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE snorkel_spot_operators ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "tier read" ON snorkel_spot_operators';
    EXECUTE 'CREATE POLICY "tier read" ON snorkel_spot_operators
               FOR SELECT TO authenticated USING (tier_rank() >= 2)';
  END IF;
END $$;

COMMIT;
