-- ============================================================
-- 0032_favorites.sql
-- Saved places — the heart on a result card, and the Saved tab in the
-- mobile bottom nav.
--
-- KEY DESIGN: place_id IS the key, and it is namespaced
-- ----------------------------------------------------
-- The seven listing tables have independent id sequences, so `id = 3`
-- means a beach, a restaurant and a stay all at once. The frontend
-- already solved this: Place.id is `${kind}:${rawId}` (see the comment on
-- Place.id in frontend/src/lib/place.ts). This table stores exactly that
-- string, so a favorite round-trips without the client having to
-- reassemble anything. place_kind/place_ref are the split halves, derived
-- SERVER-SIDE from place_id — never taken from the request body.
--
-- WHY snapshot jsonb
-- ------------------
-- Saved has to render a list of places drawn from up to seven different
-- tables. Resolving that live means seven queries (or a seven-way UNION
-- over incompatible shapes) for a list that is usually four items long.
-- The snapshot is the card: name, subtitle, coords, tags, icon. It is
-- written once at save time and is allowed to go stale — a saved place
-- whose hours changed still gets you back to the right pin, and tapping
-- it loads the live row anyway. Keys are whitelisted in the route; this
-- column is client-supplied and would otherwise be a free per-user blob
-- store.
--
-- NOT tier-gated. Saving is retention, not a feature — a user who cannot
-- keep a shortlist has less reason to come back tomorrow. The 'favorites'
-- slug in backend/payments.js describes a future premium saved-places
-- feature and is deliberately not wired to this table.
--
-- Applied live to project dbotrrrbqwgzccuiylef via Supabase MCP.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Exactly Place.id, e.g. 'beach:3'. Format enforced here as well as in
  -- the route, because the route is not the only thing that can write.
  place_id    text NOT NULL CHECK (place_id ~ '^[a-z]+:[A-Za-z0-9._-]+$'),
  place_kind  text NOT NULL CHECK (place_kind IN (
                'beach', 'restaurant', 'stay', 'activity', 'service',
                'transport', 'essential', 'snorkel', 'trail')),
  place_ref   text NOT NULL,
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Makes the save idempotent: the client PUTs without caring whether it
  -- is already there, and a double-tap cannot create two rows.
  UNIQUE (user_id, place_id)
);

-- The only read pattern: this user's saves, newest first.
CREATE INDEX IF NOT EXISTS idx_favorites_user
  ON public.favorites (user_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS. Unlike subscriptions / credit_transactions (0016), where only the
-- Stripe webhook writes and the user is read-only, the USER owns these
-- rows outright — so INSERT and DELETE policies belong here.
--
-- No UPDATE policy on purpose: a favorite is created or removed, never
-- edited. Re-saving is a DELETE + INSERT, or an upsert by the backend
-- (which connects as the table owner and bypasses these policies).
-- ------------------------------------------------------------
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own favorites read" ON public.favorites;
CREATE POLICY "own favorites read" ON public.favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own favorites insert" ON public.favorites;
CREATE POLICY "own favorites insert" ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own favorites delete" ON public.favorites;
CREATE POLICY "own favorites delete" ON public.favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
