/**
 * Vieques Cards — collect cards at real places, solve riddles, earn achievements.
 *
 * Schema and rules: db/migrations/0055_collectible_cards.sql (read its header).
 *
 *   GET  /api/cards                 your cards + region tallies (no unrevealed coordinates)
 *   POST /api/cards/nearby          radar: { lat, lng, accuracy } → count, warmth, reveals
 *   POST /api/cards/:slug/solve     answer a locate riddle   { answer }
 *   POST /api/cards/:slug/claim     collect a card    { lat, lng, accuracy, answer? }
 *   GET  /api/achievements          every achievement + this user's progress
 *
 * HIDDEN UNTIL YOU'RE CLOSE. The map never shows a card the user hasn't been
 * near. A card's coordinates are sent to a user only once a card_discoveries
 * row exists for them (written by /nearby or by a claim). Before that, the
 * radar answers with a bucketed count and a hot/cold word — never a distance,
 * which three requests could triangulate.
 *
 * TRUST MODEL. Positions come from the phone and can be spoofed; there is no
 * physical token on site (yet). So the server does every check that matters —
 * distance, accuracy, island bounds, travel speed, tier, riddle — and the
 * client's own "you're in range" banner is only a UI hint.
 *
 * PRIVACY. Positions arrive on /nearby and /claim and are used for that request
 * only. card_claims stores the computed distance + reported accuracy.
 */
import { requireAuth, rateLimit } from './middleware.js'
import { bestTier } from './payments.js'
import { fail } from './httpError.js'

// --- Rules ------------------------------------------------------------------

const TIER_RANK = { free: 0, day_trip: 1, vacation: 2, exploration: 3 }

/** Lowest pass tier that can collect each rarity (owner's call, 2026-11-19). */
export const RARITY_MIN_TIER = {
  common: 'free',
  basic: 'day_trip',
  rare: 'vacation',
  legendary: 'exploration',
}

/** Leaderboard points per card (Phase 2 uses these; achievements add theirs). */
export const RARITY_POINTS = { common: 1, basic: 2, rare: 5, legendary: 10 }

/** Generous box around Vieques incl. the cays; outside it nothing is claimable. */
const ISLAND = { minLng: -65.62, maxLng: -65.22, minLat: 18.04, maxLat: 18.20 }

const MAX_ACCURACY_M = 50     // claim: phone says it's worse than this → ask to wait for a fix
const RADAR_MAX_ACCURACY_M = 150 // radar is coarse anyway; don't spam "fuzzy GPS" while walking
const ACCURACY_SLACK_M = 25   // how much of the reported error we forgive on top of a radius
const MAX_SPEED_KMH = 120     // between consecutive claims; the island has no faster road
const RADAR_RANGE_M = 1000
const HINT_AFTER_MISSES = 3

const PR_TZ = 'America/Puerto_Rico'

/**
 * Testers (CARD_TESTER_IDS, comma-separated user ids — set on Railway) see
 * test_only cards and skip the island fence, so the owner can build and test
 * from anywhere (0056). Everyone else never sees a test card at all.
 */
const testerIds = new Set(
  (process.env.CARD_TESTER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
)
const isTester = (userId) => testerIds.has(userId)

// --- Helpers ----------------------------------------------------------------

/** Best tier the user holds right now. Same query + ranking as requireTier. */
async function currentTier(db, userId) {
  const { rows } = await db.query(
    `SELECT plan FROM public.subscriptions
      WHERE user_id = $1 AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  )
  return bestTier(rows)
}

function tierAllows(tier, rarity) {
  return TIER_RANK[tier] >= TIER_RANK[RARITY_MIN_TIER[rarity] ?? 'exploration']
}

/**
 * Normalise a typed answer so "El Fortín!", "el fortin" and " EL  FORTIN "
 * all compare equal. Stored answers in card_challenges are kept in this form.
 */
export function normalizeAnswer(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

/** Hot/cold instead of a number. */
function warmth(distanceM) {
  if (distanceM < 250) return 'burning'
  if (distanceM < 450) return 'hot'
  if (distanceM < 700) return 'warm'
  return 'cold'
}

/** Radar count, bucketed so it leaks less than an exact number. */
function radarBucket(n) {
  if (n <= 0) return '0'
  if (n === 1) return '1'
  if (n <= 3) return '2-3'
  return '4+'
}

function parsePosition(body) {
  const lat = Number(body?.lat)
  const lng = Number(body?.lng)
  const accuracy = Number(body?.accuracy)
  if (![lat, lng, accuracy].every(Number.isFinite)) return null
  if (accuracy < 0) return null
  return { lat, lng, accuracy }
}

function onIsland({ lat, lng }) {
  return lng >= ISLAND.minLng && lng <= ISLAND.maxLng && lat >= ISLAND.minLat && lat <= ISLAND.maxLat
}

/** A locate riddle the user hasn't solved hides the card's region and radar presence. */
function riddleLocked(row) {
  return row.challenge_kind === 'locate' && !row.solved_at && row.serial_no == null
}

/**
 * Shape one catalog row for this user. Coordinates go out only for cards the
 * user has revealed or owns; the region only once any locate riddle is solved.
 */
function toCard(row, tier) {
  const owned = row.serial_no != null
  const revealed = owned || row.discovered_at != null
  const locked = riddleLocked(row)
  return {
    slug: row.slug,
    // An unrevealed card is a silhouette: rarity + region, nothing that locates it.
    name: revealed ? row.name : null,
    lore: revealed ? row.lore : null,
    image: revealed ? row.image_path : null,
    rarity: row.rarity,
    tags: row.tags ?? [],
    region: locked ? null : row.region,
    hint: locked ? null : row.hint,
    revealed,
    discoveredAt: row.discovered_at,
    location: revealed ? { center: [row.longitude, row.latitude], radiusM: row.radius_m } : null,
    placeId: revealed ? row.place_id : null,
    activeHours: row.active_hours ? [row.active_hours_lo, row.active_hours_hi] : null,
    soldOut: row.max_claims != null && row.claim_count >= row.max_claims && !owned,
    totalClaims: row.claim_count,
    maxClaims: row.max_claims,
    minTier: RARITY_MIN_TIER[row.rarity],
    lockedByTier: !tierAllows(tier, row.rarity),
    owned,
    serialNo: row.serial_no,
    claimedAt: row.claimed_at,
    challenge: row.challenge_kind
      ? {
          kind: row.challenge_kind,
          prompt: row.challenge_prompt,
          solved: Boolean(row.solved_at),
          // The riddle's own hint shows up after a few misses.
          hint: (row.attempts ?? 0) >= HINT_AFTER_MISSES ? row.challenge_hint : null,
        }
      : null,
  }
}

/** Per-region "found / total" for the Collection header. Riddle-locked cards count as Mystery. */
function regionTallies(rows) {
  const by = new Map()
  for (const r of rows) {
    const key = riddleLocked(r) ? null : r.region
    const t = by.get(key) ?? { region: key, found: 0, total: 0 }
    t.total += 1
    if (r.serial_no != null) t.found += 1
    by.set(key, t)
  }
  return [...by.values()].sort((a, b) => (a.region ?? '~').localeCompare(b.region ?? '~'))
}

// Everything the user may see about each card. $1 = user id. Not ordered, so
// callers can wrap it (see /nearby).
const CATALOG_BASE = `
  SELECT c.slug, c.name, c.lore, c.rarity, c.tags, c.region, c.latitude, c.longitude,
         c.radius_m, c.place_id, c.image_path, c.hint, c.sort,
         c.active_hours, lower(c.active_hours) AS active_hours_lo,
         upper(c.active_hours) AS active_hours_hi,
         c.max_claims, c.claim_count, c.test_only,
         cl.serial_no, cl.claimed_at, cd.discovered_at,
         ch.kind AS challenge_kind, ch.prompt AS challenge_prompt, ch.hint AS challenge_hint,
         cp.solved_at, cp.attempts
    FROM public.collectible_cards c
    LEFT JOIN public.card_claims cl        ON cl.card_id = c.id AND cl.user_id = $1
    LEFT JOIN public.card_discoveries cd   ON cd.card_id = c.id AND cd.user_id = $1
    LEFT JOIN public.card_challenges ch    ON ch.card_id = c.id
    LEFT JOIN public.challenge_progress cp ON cp.card_id = c.id AND cp.user_id = $1
   WHERE (c.is_active
          AND (c.starts_at IS NULL OR c.starts_at <= now())
          AND (c.ends_at   IS NULL OR c.ends_at   >  now()))
      OR cl.user_id IS NOT NULL            /* a retired card stays in your collection */
`

/**
 * How far along is a user toward one achievement? The single source of truth
 * for "complete": the progress bars and the award both read it, so a bar can
 * never show 5/5 without the badge.
 *
 * @returns {{have:number, need:number} | null}  null for a rule shape we don't
 *          understand (logged; never awarded rather than awarded by accident).
 */
function achievementProgress(rule, ownedSlugs, ownedTagCounts) {
  if (Array.isArray(rule?.all_of) && rule.all_of.length > 0) {
    const have = rule.all_of.filter((s) => ownedSlugs.has(s)).length
    return { have, need: rule.all_of.length }
  }
  const count = Number(rule?.count)
  if (typeof rule?.tag === 'string' && Number.isInteger(count) && count >= 1) {
    return { have: Math.min(ownedTagCounts.get(rule.tag) ?? 0, count), need: count }
  }
  console.warn('cards: unrecognised achievement rule', JSON.stringify(rule))
  return null
}

/**
 * Which achievements did this claim just complete?
 *
 * Runs inside the claim transaction, after the new card_claims row is
 * inserted, so `ownedSlugs`/`ownedTagCounts` already include the new card.
 *
 * @param {Array<{id:number, slug:string, rule:object}>} candidates
 *        Active achievements the user has NOT earned yet.
 * @param {Set<string>} ownedSlugs   Slugs of every card the user now holds.
 * @param {Map<string, number>} ownedTagCounts  tag → how many held cards carry it.
 * @returns {Array<number>} ids of achievements now complete.
 */
export function completedAchievements(candidates, ownedSlugs, ownedTagCounts) {
  return candidates
    .filter((a) => {
      const p = achievementProgress(a.rule, ownedSlugs, ownedTagCounts)
      return p !== null && p.have >= p.need
    })
    .map((a) => a.id)
}

async function ownedSets(db, userId, tester = false) {
  // Test cards only count (toward test badges) while you're a tester.
  const { rows } = await db.query(
    `SELECT c.slug, c.tags
       FROM public.card_claims cl
       JOIN public.collectible_cards c ON c.id = cl.card_id
      WHERE cl.user_id = $1 AND (NOT c.test_only OR $2)`,
    [userId, tester],
  )
  const slugs = new Set()
  const tags = new Map()
  for (const r of rows) {
    slugs.add(r.slug)
    for (const t of r.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1)
  }
  return { slugs, tags }
}

/**
 * Count an attempt against a riddle, enforcing the per-hour cap in Postgres
 * (the in-memory rateLimit resets on every deploy, so it can't be the only
 * guard against guessing). Returns the progress row, or null when capped.
 */
async function recordAttempt(db, userId, cardId, maxPerHour) {
  const { rows } = await db.query(
    `INSERT INTO public.challenge_progress AS p (user_id, card_id, attempts, window_attempts, window_started_at)
     VALUES ($1, $2, 1, 1, now())
     ON CONFLICT (user_id, card_id) DO UPDATE SET
       attempts = p.attempts + 1,
       window_attempts = CASE WHEN p.window_started_at < now() - interval '1 hour'
                              THEN 1 ELSE p.window_attempts + 1 END,
       window_started_at = CASE WHEN p.window_started_at < now() - interval '1 hour'
                                THEN now() ELSE p.window_started_at END
     RETURNING attempts, window_attempts, solved_at`,
    [userId, cardId],
  )
  const row = rows[0]
  return row.window_attempts > maxPerHour ? null : row
}

// --- Routes -----------------------------------------------------------------

export function mountCards(app, pool) {
  app.get('/api/cards', requireAuth, rateLimit({ max: 60 }), async (req, res) => {
    try {
      const tester = isTester(req.user.id)
      const [tier, { rows: all }] = await Promise.all([
        currentTier(pool, req.user.id),
        pool.query(`${CATALOG_BASE} ORDER BY c.sort, c.name`, [req.user.id]),
      ])
      const rows = all.filter((r) => tester || !r.test_only)
      const cards = rows.map((r) => toCard(r, tier))
      res.json({
        tier,
        cards,
        regions: regionTallies(rows),
        owned: cards.filter((c) => c.owned).length,
        total: cards.length,
      })
    } catch (e) {
      fail(res, 'GET /api/cards', e)
    }
  })

  // The radar. The client calls this only while the Cards layer is on, after
  // it has moved ~75 m, at most every ~20 s (see the frontend hook). 6/min
  // leaves headroom for that and stops a script sweeping the island.
  app.post('/api/cards/nearby', requireAuth, rateLimit({ max: 6 }), async (req, res) => {
    const pos = parsePosition(req.body)
    if (!pos) return res.status(400).json({ error: 'Location is required.', code: 'NO_LOCATION' })
    const userId = req.user.id
    const tester = isTester(userId)
    const empty = { radar: { count: '0', warmth: null }, revealed: [] }
    if (!tester && !onIsland(pos)) return res.json(empty)
    if (pos.accuracy > RADAR_MAX_ACCURACY_M) return res.json({ ...empty, lowAccuracy: true })

    try {
      // Live cards within radar range that this user hasn't revealed or
      // collected, minus unsolved locate riddles (those stay invisible until
      // solved — that's the riddle's whole job).
      const { rows } = await pool.query(
        `SELECT c.id, c.slug, c.reveal_radius_m,
                ST_Distance(c.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS distance_m
           FROM public.collectible_cards c
           LEFT JOIN public.card_challenges ch    ON ch.card_id = c.id
           LEFT JOIN public.challenge_progress cp ON cp.card_id = c.id AND cp.user_id = $1
          WHERE c.is_active
            AND (c.starts_at IS NULL OR c.starts_at <= now())
            AND (c.ends_at   IS NULL OR c.ends_at   >  now())
            AND (NOT c.test_only OR $5)
            AND ST_DWithin(c.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
            AND NOT EXISTS (SELECT 1 FROM public.card_discoveries d WHERE d.user_id = $1 AND d.card_id = c.id)
            AND NOT EXISTS (SELECT 1 FROM public.card_claims cl     WHERE cl.user_id = $1 AND cl.card_id = c.id)
            -- IS DISTINCT FROM, not NOT(=): for a card with no riddle ch.kind is
            -- NULL, and NOT (NULL AND …) is NULL, which would drop every such card.
            AND (ch.kind IS DISTINCT FROM 'locate' OR cp.solved_at IS NOT NULL)`,
        [userId, pos.lng, pos.lat, RADAR_RANGE_M, tester],
      )

      const slack = Math.min(pos.accuracy, ACCURACY_SLACK_M)
      const inReveal = rows.filter((r) => r.distance_m <= r.reveal_radius_m + slack)
      const stillHidden = rows.filter((r) => r.distance_m > r.reveal_radius_m + slack)

      let revealed = []
      if (inReveal.length) {
        await pool.query(
          `INSERT INTO public.card_discoveries (user_id, card_id)
           SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
          [userId, inReveal.map((r) => r.id)],
        )
        // Send the newly revealed cards in the same shape GET /api/cards uses,
        // so the client can drop them straight onto the map.
        const [tier, shaped] = await Promise.all([
          currentTier(pool, userId),
          pool.query(`SELECT * FROM (${CATALOG_BASE}) x WHERE x.slug = ANY($2)`, [
            userId, inReveal.map((r) => r.slug),
          ]),
        ])
        revealed = shaped.rows.map((r) => toCard(r, tier))
      }

      const nearest = stillHidden.reduce((m, r) => Math.min(m, r.distance_m), Infinity)
      res.json({
        radar: {
          count: radarBucket(stillHidden.length),
          warmth: Number.isFinite(nearest) ? warmth(nearest) : null,
        },
        revealed,
      })
    } catch (e) {
      fail(res, 'POST /api/cards/nearby', e)
    }
  })

  app.get('/api/achievements', requireAuth, rateLimit({ max: 60 }), async (req, res) => {
    try {
      const [{ rows }, owned] = await Promise.all([
        pool.query(
          `SELECT a.id, a.slug, a.name, a.description, a.badge_path, a.points, a.rule,
                  ua.earned_at
             FROM public.achievements a
             LEFT JOIN public.user_achievements ua
                    ON ua.achievement_id = a.id AND ua.user_id = $1
            WHERE (a.is_active OR ua.user_id IS NOT NULL)
              AND (NOT a.test_only OR $2)
            ORDER BY a.sort, a.name`,
          [req.user.id, isTester(req.user.id)],
        ),
        ownedSets(pool, req.user.id, isTester(req.user.id)),
      ])
      res.json({
        achievements: rows.map((a) => ({
          slug: a.slug,
          name: a.name,
          description: a.description,
          badge: a.badge_path,
          points: a.points,
          earnedAt: a.earned_at,
          progress: achievementProgress(a.rule, owned.slugs, owned.tags) ?? { have: 0, need: 0 },
        })),
      })
    } catch (e) {
      fail(res, 'GET /api/achievements', e)
    }
  })

  // Riddle answers. For 'locate' riddles (solving unhides the region and puts
  // the card on the radar); an 'on_site' answer is checked on the claim itself.
  app.post('/api/cards/:slug/solve', requireAuth, rateLimit({ max: 20 }), async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.region, ch.kind, ch.answers, ch.hint, ch.max_attempts_per_hour
           FROM public.collectible_cards c
           JOIN public.card_challenges ch ON ch.card_id = c.id
          WHERE c.slug = $1 AND c.is_active
            AND (c.starts_at IS NULL OR c.starts_at <= now())
            AND (c.ends_at   IS NULL OR c.ends_at   >  now())
            AND (NOT c.test_only OR $2)`,
        [req.params.slug, isTester(req.user.id)],
      )
      const ch = rows[0]
      if (!ch) return res.status(404).json({ error: 'No riddle on this card.', code: 'NO_CHALLENGE' })
      if (ch.kind !== 'locate') {
        return res.status(400).json({ error: 'Answer this one at the spot when you collect.', code: 'ON_SITE' })
      }
      const progress = await recordAttempt(pool, req.user.id, ch.id, ch.max_attempts_per_hour)
      if (!progress) {
        return res.status(429).json({ error: 'Too many guesses — try again in an hour.', code: 'TOO_MANY_GUESSES' })
      }
      if (progress.solved_at) return res.json({ solved: true, region: ch.region })

      const correct = ch.answers.includes(normalizeAnswer(req.body?.answer))
      if (!correct) {
        return res.status(422).json({
          error: 'Not quite.',
          code: 'WRONG_ANSWER',
          hint: progress.attempts >= HINT_AFTER_MISSES ? ch.hint : null,
        })
      }
      await pool.query(
        `UPDATE public.challenge_progress SET solved_at = now()
          WHERE user_id = $1 AND card_id = $2 AND solved_at IS NULL`,
        [req.user.id, ch.id],
      )
      // The reward for solving is the area to search — not the spot.
      res.json({ solved: true, region: ch.region })
    } catch (e) {
      fail(res, 'POST /api/cards/:slug/solve', e)
    }
  })

  app.post('/api/cards/:slug/claim', requireAuth, rateLimit({ max: 10 }), async (req, res) => {
    const pos = parsePosition(req.body)
    if (!pos) return res.status(400).json({ error: 'Location is required to collect.', code: 'NO_LOCATION' })

    const userId = req.user.id
    const tester = isTester(userId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Card + live distance in one go. Locks the row: the serial bump below
      // and the max_claims check must not race another claim of this card.
      // NO KEY UPDATE, not UPDATE: recordAttempt() writes challenge_progress on
      // a *different* connection, and that FK check takes KEY SHARE on this
      // row. FOR UPDATE would block it — a self-deadlock that hangs forever.
      const { rows } = await client.query(
        `SELECT c.id, c.slug, c.name, c.rarity, c.radius_m,
                c.max_claims, c.claim_count, c.place_id, c.test_only,
                (c.active_hours IS NULL OR
                   extract(hour FROM now() AT TIME ZONE '${PR_TZ}')::int <@ c.active_hours) AS in_hours,
                (c.is_active AND (c.starts_at IS NULL OR c.starts_at <= now())
                             AND (c.ends_at IS NULL OR c.ends_at > now())) AS live,
                ST_Distance(c.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS distance_m,
                ch.kind AS challenge_kind, ch.answers, ch.hint AS challenge_hint,
                ch.max_attempts_per_hour, cp.solved_at,
                (cd.card_id IS NOT NULL) AS discovered
           FROM public.collectible_cards c
           LEFT JOIN public.card_challenges ch    ON ch.card_id = c.id
           LEFT JOIN public.challenge_progress cp ON cp.card_id = c.id AND cp.user_id = $4
           LEFT JOIN public.card_discoveries cd   ON cd.card_id = c.id AND cd.user_id = $4
          WHERE c.slug = $1
          FOR NO KEY UPDATE OF c`,
        [req.params.slug, pos.lng, pos.lat, userId],
      )
      const card = rows[0]
      const reject = async (status, body) => {
        await client.query('ROLLBACK')
        return res.status(status).json(body)
      }
      const notFound = { error: 'That card isn’t out right now.', code: 'NOT_FOUND' }
      if (!card || (card.test_only && !tester)) return reject(404, notFound)

      // Already yours → idempotent success (double-tap, retry after a timeout).
      // Checked before `live` so a retry on a since-retired card still says yes.
      const mine = await client.query(
        `SELECT serial_no, claimed_at FROM public.card_claims WHERE user_id = $1 AND card_id = $2`,
        [userId, card.id],
      )
      if (mine.rows[0]) {
        await client.query('ROLLBACK')
        return res.json({ claimed: true, alreadyOwned: true, serialNo: mine.rows[0].serial_no, newAchievements: [] })
      }
      if (!card.live) return reject(404, notFound)

      // Before any check that answers with a distance: a slug guessed off the
      // radar must not tell you how far away it is.
      if (card.challenge_kind === 'locate' && !card.solved_at) {
        return reject(403, { error: 'Solve the riddle first.', code: 'RIDDLE_UNSOLVED' })
      }

      const tier = await currentTier(client, userId)
      if (!tierAllows(tier, card.rarity)) {
        // Same shape requireTier sends, so the app's existing upsell handles it.
        return reject(402, {
          error: `${/^[aeiou]/.test(RARITY_MIN_TIER[card.rarity]) ? 'An' : 'A'} ${RARITY_MIN_TIER[card.rarity].replace('_', ' ')} pass unlocks ${card.rarity} cards.`,
          code: 'UPGRADE_REQUIRED',
          feature: `card_${card.rarity}`,
          tier,
          minTier: RARITY_MIN_TIER[card.rarity],
        })
      }
      if (!card.in_hours) return reject(409, { error: 'This card only appears at certain hours.', code: 'NOT_NOW' })
      if (card.max_claims != null && card.claim_count >= card.max_claims) {
        return reject(409, { error: 'Every copy of this card has been collected.', code: 'SOLD_OUT' })
      }

      // --- Were you there? ---------------------------------------------------
      if (pos.accuracy > MAX_ACCURACY_M) {
        return reject(422, { error: 'Your GPS is fuzzy right now — step into the open and try again.', code: 'LOW_ACCURACY' })
      }
      if (!tester && !onIsland(pos)) {
        return reject(403, { error: 'Cards can only be collected on Vieques.', code: 'NOT_ON_ISLAND' })
      }
      const allowed = card.radius_m + Math.min(pos.accuracy, ACCURACY_SLACK_M)
      if (card.distance_m > allowed) {
        // A distance only for a card you've already revealed (you've seen its
        // pin anyway); otherwise hot/cold, so claims can't be used as a radar.
        return reject(403, card.discovered
          ? { error: 'Get a little closer.', code: 'TOO_FAR', distanceM: Math.round(card.distance_m - card.radius_m) }
          : { error: 'Not here — keep searching.', code: 'TOO_FAR', warmth: warmth(card.distance_m) })
      }

      // Impossible travel: compare with this user's previous claim. Test and
      // real cards are separate worlds — an Ohio desk claim then a Vieques
      // claim the same day isn't cheating.
      const prev = await client.query(
        `SELECT ST_Distance(pc.geom, c.geom) AS meters,
                extract(epoch FROM now() - cl.claimed_at) AS seconds
           FROM public.card_claims cl
           JOIN public.collectible_cards pc ON pc.id = cl.card_id
           JOIN public.collectible_cards c  ON c.id = $2
          WHERE cl.user_id = $1 AND pc.test_only = c.test_only
          ORDER BY cl.claimed_at DESC LIMIT 1`,
        [userId, card.id],
      )
      if (prev.rows[0]) {
        const { meters, seconds } = prev.rows[0]
        const kmh = (meters / 1000) / Math.max(seconds / 3600, 1 / 3600)
        if (meters > 500 && kmh > MAX_SPEED_KMH) {
          return reject(429, { error: 'Whoa, that was fast. Try again in a few minutes.', code: 'TOO_FAST' })
        }
      }

      // On-site question, asked only once you're provably close.
      if (card.challenge_kind === 'on_site') {
        if (req.body?.answer == null) {
          return reject(409, { error: 'Answer the question to collect.', code: 'ANSWER_REQUIRED' })
        }
        // Counted outside the claim transaction so a rollback can't erase it.
        const progress = await recordAttempt(pool, userId, card.id, card.max_attempts_per_hour)
        if (!progress) return reject(429, { error: 'Too many guesses — try again in an hour.', code: 'TOO_MANY_GUESSES' })
        if (!card.answers.includes(normalizeAnswer(req.body.answer))) {
          return reject(422, {
            error: 'Not quite — look around.',
            code: 'WRONG_ANSWER',
            hint: progress.attempts >= HINT_AFTER_MISSES ? card.challenge_hint : null,
          })
        }
      }

      // --- Collect -----------------------------------------------------------
      const bump = await client.query(
        `UPDATE public.collectible_cards SET claim_count = claim_count + 1
          WHERE id = $1 RETURNING claim_count`,
        [card.id],
      )
      const serialNo = bump.rows[0].claim_count
      await client.query(
        `INSERT INTO public.card_claims (user_id, card_id, serial_no, distance_m, accuracy_m, tier_at_claim)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, card.id, serialNo, card.distance_m, pos.accuracy, tier],
      )
      // Collecting implies you found it (e.g. GPS jumped straight into range).
      await client.query(
        `INSERT INTO public.card_discoveries (user_id, card_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, card.id],
      )

      // --- Achievements ------------------------------------------------------
      const owned = await ownedSets(client, userId, tester)
      const { rows: candidates } = await client.query(
        `SELECT a.id, a.slug, a.name, a.description, a.badge_path, a.points, a.rule
           FROM public.achievements a
          WHERE a.is_active
            AND (NOT a.test_only OR $2)
            AND NOT EXISTS (SELECT 1 FROM public.user_achievements ua
                             WHERE ua.user_id = $1 AND ua.achievement_id = a.id)`,
        [userId, tester],
      )
      const earnedIds = new Set(completedAchievements(candidates, owned.slugs, owned.tags))
      const earned = candidates.filter((a) => earnedIds.has(a.id))
      if (earned.length) {
        await client.query(
          `INSERT INTO public.user_achievements (user_id, achievement_id)
           SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
          [userId, earned.map((a) => a.id)],
        )
      }

      await client.query('COMMIT')
      res.json({
        claimed: true,
        alreadyOwned: false,
        serialNo,
        maxClaims: card.max_claims,
        newAchievements: earned.map((a) => ({
          slug: a.slug, name: a.name, description: a.description, badge: a.badge_path, points: a.points,
        })),
      })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      // Lost a race with our own double-tap: the other request already won.
      // Only the one-per-user constraint means "yours"; a serial collision is a real error.
      if (e?.code === '23505' && e.constraint === 'card_claims_user_id_card_id_key') return res.json({ claimed: true, alreadyOwned: true, newAchievements: [] })
      fail(res, 'POST /api/cards/:slug/claim', e)
    } finally {
      client.release()
    }
  })
}
