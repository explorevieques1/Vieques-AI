-- ============================================================================
--  0055_collectible_cards.sql — Vieques Cards: collect cards at real places,
--  solve riddles, earn achievements, climb Top Traveler
-- ============================================================================
--
--  WHAT THIS IS
--  ------------
--  A card is pinned to a real spot on the island (the Ceiba tree, the top of
--  Monte Pirata, the end of Mosquito Pier…). Stand inside its radius, tap
--  Collect, and it goes into your collection with a serial number ("#7 of 50").
--  Sets of cards earn achievements ("Beach Bum": all the beach cards).
--
--  DISCOVERY — cards are hidden until you're close
--  ----------------------------------------------
--  No card is ever drawn on the map until the user has been near it. A card
--  goes through four stages, each giving away a little more:
--    region   anywhere   the Collection shows "Esperanza · 1 of 4 found"
--    radar    ~1 km      POST /api/cards/nearby → "2 cards nearby" + hot/cold
--    reveal   reveal_radius_m (~200 m)   a card_discoveries row is written;
--                        from then on the card's point is sent to THIS user
--    collect  radius_m   POST /api/cards/:slug/claim
--  The browser never receives the coordinates of a card it hasn't revealed —
--  hiding them client-side would be readable in the network tab.
--
--  TABLES
--  ------
--    collectible_cards   catalog (owner-authored, backend-only)
--    card_challenges     optional riddle per card (answers never leave the server)
--    challenge_progress  per-user attempts / solved state for a riddle
--    card_discoveries    which cards a user has revealed (came within reveal range)
--    card_claims         who holds which card, with its serial
--    achievements        sets, as a jsonb rule (no code per new achievement)
--    user_achievements   who earned what
--    traveler_profiles   leaderboard display name + opt-out
--
--  RARITY → PASS TIER (enforced in backend/cards.js, not here)
--  ----------------------------------------------------------
--    common → any account   basic → Day Trip+   rare → Vacation+
--    legendary → Exploration
--
--  CHALLENGE KINDS
--  ---------------
--    locate   the riddle is the clue to WHERE the card is. Until it's solved
--             the card's region is withheld and it never shows on the radar
--             or reveals, even if you walk right past it.
--    on_site  a question only answerable standing there ("what year is on the
--             Fortín gate?"). Asked at claim time, after the GPS check. Doubles
--             as anti-cheat that needs no sign or sticker on site.
--
--  ACHIEVEMENT RULES (achievements.rule)
--  -------------------------------------
--    {"all_of": ["monte-pirata", "cerro-el-buey"]}   every listed card slug
--    {"tag": "beach", "count": 5}                     N cards carrying a tag
--  Evaluated in the claim transaction (backend/cards.js).
--
--  SERIAL NUMBERS
--  --------------
--  collectible_cards.claim_count is bumped with UPDATE … RETURNING inside the
--  claim transaction. The row lock that UPDATE takes serialises concurrent
--  claims of the same card, so serials are gap-free and unique without a
--  SELECT count(*) race. UNIQUE (card_id, serial_no) is the backstop.
--
--  PRIVACY
--  -------
--  The radar (only while the Cards layer is on) and the claim send the
--  device's position to the backend for that one request. Positions are never
--  stored. What IS stored: card_claims keeps the computed distance + GPS
--  accuracy, and card_discoveries / card_claims timestamps imply "this user was
--  near this landmark at this time" — the privacy page must say so. The
--  catalog is backend-only so card positions and riddle answers can't be read
--  through PostgREST.
--  Every per-user table cascades on auth.users delete (account deletion, 0050).
--
--  AUTHORING
--  ---------
--  Through the local admin tool (backend/admin.js KINDS: cards, achievements)
--  or by INSERT. Coordinates come from existing place rows or a dropped pin on
--  the map — never guessed.
--
--  Applied live to project dbotrrrbqwgzccuiylef on 2026-11-19 (SQL Editor),
--  after a rolled-back dry run exercised the radar / reveal / claim queries.
--
--  Idempotent: safe to re-run.
--  Undo: DROP TABLE user_achievements, achievements, card_claims,
--        card_discoveries, challenge_progress, card_challenges, traveler_profiles,
--        collectible_cards CASCADE; DROP FUNCTION collectible_cards_set_geom();
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  Catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collectible_cards (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text        NOT NULL,
  lore             text,
  rarity           text        NOT NULL DEFAULT 'common'
                               CHECK (rarity IN ('common', 'basic', 'rare', 'legendary')),
  tags             text[]      NOT NULL DEFAULT '{}',
  latitude         double precision NOT NULL,
  longitude        double precision NOT NULL,
  geom             geography(Point, 4326),
  -- Real-world GPS on a phone is ±5–20 m in the open, worse under trees. Under
  -- 15 m is uncollectable in practice; over 500 m isn't "being there".
  radius_m         integer     NOT NULL DEFAULT 75 CHECK (radius_m BETWEEN 15 AND 500),
  -- Optional link to an existing map place, same 'kind:id' format as favorites.
  place_id         text        CHECK (place_id IS NULL OR place_id ~ '^[a-z]+:[A-Za-z0-9._-]+$'),
  -- How close before the card appears on the user's map. Must be at least
  -- the collect radius, or a card could be collectable before it's visible.
  reveal_radius_m  integer     NOT NULL DEFAULT 200 CHECK (reveal_radius_m BETWEEN 50 AND 1000),
  -- Area name for the Collection tallies ("Esperanza · 1 of 4"). Free text,
  -- but keep to the owner's short list so tallies group cleanly.
  region           text        NOT NULL,
  image_path       text,
  -- Optional nudge shown on the card before it's found ("the island's oldest tree").
  hint             text,
  -- Puerto Rico local hours the card can be claimed, e.g. '[19,24)' for a bio
  -- bay night card. NULL = any time. A range can't wrap midnight; '[19,24)'
  -- covers the bio bay tours, which is what this exists for.
  active_hours     int4range   CHECK (active_hours IS NULL OR active_hours <@ int4range(0, 24, '[]')),
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_claims       integer     CHECK (max_claims IS NULL OR max_claims > 0),
  claim_count      integer     NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  -- Reserved for partner coupon cards (later phase). Unused by Phase 1 code.
  reward           jsonb,
  sort             integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collectible_cards_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT collectible_cards_cap CHECK (max_claims IS NULL OR claim_count <= max_claims),
  CONSTRAINT collectible_cards_reveal_covers_collect CHECK (reveal_radius_m >= radius_m)
);

CREATE INDEX IF NOT EXISTS idx_collectible_cards_geom
  ON public.collectible_cards USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_collectible_cards_tags
  ON public.collectible_cards USING gin (tags);

-- search_path pinned (see the note in 0033 on why the older *_set_geom
-- functions trip the advisor).
CREATE OR REPLACE FUNCTION public.collectible_cards_set_geom() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collectible_cards_geom ON public.collectible_cards;
CREATE TRIGGER trg_collectible_cards_geom
  BEFORE INSERT OR UPDATE ON public.collectible_cards
  FOR EACH ROW EXECUTE FUNCTION public.collectible_cards_set_geom();

-- ---------------------------------------------------------------------------
--  Riddles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_challenges (
  card_id               bigint  PRIMARY KEY REFERENCES public.collectible_cards(id) ON DELETE CASCADE,
  kind                  text    NOT NULL CHECK (kind IN ('locate', 'on_site')),
  prompt                text    NOT NULL,
  -- Accepted answers, already in normalised form (lowercase, no accents or
  -- punctuation, single spaces). English and Spanish variants both go here.
  answers               text[]  NOT NULL CHECK (cardinality(answers) > 0),
  hint                  text,
  max_attempts_per_hour integer NOT NULL DEFAULT 6 CHECK (max_attempts_per_hour BETWEEN 1 AND 60),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_progress (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id           bigint      NOT NULL REFERENCES public.collectible_cards(id) ON DELETE CASCADE,
  attempts          integer     NOT NULL DEFAULT 0,      -- lifetime, drives "show hint after 3"
  window_attempts   integer     NOT NULL DEFAULT 0,      -- in the current hour window
  window_started_at timestamptz NOT NULL DEFAULT now(),
  solved_at         timestamptz,
  PRIMARY KEY (user_id, card_id)
);

-- ---------------------------------------------------------------------------
--  Discoveries — written by POST /api/cards/nearby (and by a claim) the first
--  time a user is inside a card's reveal_radius_m. Never deleted: once you've
--  found a card it stays on your map so you can come back for it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_discoveries (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id       bigint      NOT NULL REFERENCES public.collectible_cards(id) ON DELETE CASCADE,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

-- ---------------------------------------------------------------------------
--  Claims
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_claims (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id       bigint      NOT NULL REFERENCES public.collectible_cards(id) ON DELETE RESTRICT,
  serial_no     integer     NOT NULL CHECK (serial_no > 0),
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  distance_m    real        NOT NULL,
  accuracy_m    real        NOT NULL,
  tier_at_claim text        NOT NULL,
  UNIQUE (user_id, card_id),
  UNIQUE (card_id, serial_no)
);

CREATE INDEX IF NOT EXISTS idx_card_claims_user   ON public.card_claims (user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_claims_recent ON public.card_claims (claimed_at DESC);

-- ---------------------------------------------------------------------------
--  Achievements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text        NOT NULL,
  description text,
  badge_path  text,
  points      integer     NOT NULL DEFAULT 10 CHECK (points >= 0),
  -- Non-empty lists and positive counts only: an empty all_of or count 0
  -- would be "complete" on a user's very first claim.
  rule        jsonb       NOT NULL CHECK (
                (rule ? 'all_of' AND jsonb_typeof(rule->'all_of') = 'array'
                   AND jsonb_array_length(rule->'all_of') > 0)
                -- CASE, not AND: Postgres doesn't promise left-to-right AND, so
                -- '"count":"five"' could hit the ::numeric cast and error out.
                OR (rule ? 'tag' AND jsonb_typeof(rule->'tag') = 'string'
                    AND CASE WHEN jsonb_typeof(rule->'count') = 'number'
                             THEN (rule->>'count')::numeric >= 1 ELSE false END)),
  sort        integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id bigint      NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
--  Leaderboard identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traveler_profiles (
  user_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        text        CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 24),
  leaderboard_opt_out boolean     NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  RLS. The backend connects as table owner and bypasses all of this; these
--  policies are for the browser's Supabase client, which should see only its
--  own claims/achievements/profile and nothing of the catalog or riddles.
-- ---------------------------------------------------------------------------
ALTER TABLE public.collectible_cards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_challenges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_discoveries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traveler_profiles  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.collectible_cards, public.card_challenges,
              public.challenge_progress, public.achievements
  FROM anon, authenticated;

DROP POLICY IF EXISTS "own card discoveries read" ON public.card_discoveries;
CREATE POLICY "own card discoveries read" ON public.card_discoveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own card claims read" ON public.card_claims;
CREATE POLICY "own card claims read" ON public.card_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own achievements read" ON public.user_achievements;
CREATE POLICY "own achievements read" ON public.user_achievements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own traveler profile read" ON public.traveler_profiles;
CREATE POLICY "own traveler profile read" ON public.traveler_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.collectible_cards IS
  'Vieques Cards catalog. Backend-only: positions are revealed per user via card_discoveries. See 0055 header.';
COMMENT ON TABLE public.card_claims IS
  'Who holds which card + serial. Stores distance/accuracy only, never coordinates.';

COMMIT;
