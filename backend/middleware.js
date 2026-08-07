// ============================================================================
//  middleware.js — auth, entitlement, and rate limiting for protected routes
// ============================================================================
//  Closes SECURITY.md Finding 1: /api/ai/chat had no authentication at all, so
//  anyone on the internet could spend the Anthropic balance. A route that does
//  not use requireAuth has NO authentication — CORS does not count (it only
//  stops browser JS from other origins, not curl/scripts).
// ============================================================================
import { getUserFromAuthHeader, bestTier, tierHas } from './payments.js'
// Never hand a raw exception message to the browser — see httpError.js.
import { fail } from './httpError.js'

// --- Authentication ----------------------------------------------------------
// Verifies the Supabase JWT via getUserFromAuthHeader and attaches req.user.
export async function requireAuth(req, res, next) {
  const user = await getUserFromAuthHeader(req)
  if (!user) return res.status(401).json({ error: 'Not signed in' })
  req.user = user
  next()
}

// --- Tier gating ---------------------------------------------------------------
// Asks "does your plan include THIS feature?" — the check PRICING.md's ladder
// needs. Must run AFTER requireAuth.
//
// Replaced an earlier binary requireEntitlement() ("have you paid at all?"),
// which was deleted once every route had moved over. Do not reintroduce a
// binary gate here: a paid-or-not check cannot express the ladder, and the two
// drifted apart the moment tiers gained separate preview slugs.
//
// Mirrors public.tier_rank() in db/migrations/0022_tier_rls.sql. The Postgres
// policy and this middleware are two enforcement layers over the same rule; if
// they disagree, the API and direct-PostgREST callers see different data.
//
// Sets req.tier so handlers can trim their response for lower tiers (e.g.
// /api/beaches returns name + coords only for 'free') instead of 402-ing.
//
// `feature` may be an array, in which case holding ANY of them passes. That is
// needed wherever the free tier's preview-grade feature and the paid tiers'
// full-fat one are separate slugs — FEATURES gives 'free' the slug
// 'restaurant_preview' but every paid tier 'restaurants', and a flat
// tierHas() check against either slug alone locks out half the customers.
export function requireTier(pool, feature) {
  const wanted = Array.isArray(feature) ? feature : [feature]
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT plan FROM public.subscriptions
          WHERE user_id = $1 AND status = 'active'
            AND (expires_at IS NULL OR expires_at > now())`,
        [req.user.id],
      )
      const tier = bestTier(rows)
      if (!wanted.some((f) => tierHas(tier, f))) {
        // 402 Payment Required, with enough structure for the client to render
        // a targeted upsell rather than a generic "access denied".
        return res.status(402).json({
          error: 'Your plan does not include this feature.',
          code: 'UPGRADE_REQUIRED',
          feature: wanted[0],
          tier,
        })
      }
      req.tier = tier
      next()
    } catch (e) {
      fail(res, 'requireTier', e)
    }
  }
}

// --- Credit gating --------------------------------------------------------------
// The Ask AI gate. Entitlement is the WRONG check for AI in both directions:
// Day Trip holds an active subscription but is allocated 0 messages, while the
// free tier holds no subscription but gets 3. Only the ledger balance answers
// this correctly.
//
// RESERVES the credit here rather than checking-then-spending in the handler.
// The old split — read balance, run a multi-second LLM call, THEN insert the
// -1 row — left a window as wide as the model's latency: two requests a second
// apart both read balance 1 and both got an answer. Deducting up front closes
// it, and refundCredit() below puts the credit back when the provider fails,
// which is what the old ordering was really protecting against.
//
// The ledger is append-only (balance = SUM(amount)), so there is no row to lock
// and no balance column to compare. Atomicity comes from making the guard part
// of the INSERT itself: the SELECT ... WHERE clause and the write happen in one
// statement, against one snapshot, so concurrent callers cannot both pass.
export function requireCredits(pool) {
  return async (req, res, next) => {
    // Client-supplied key so a retried request reuses its reservation instead
    // of buying a second one. Falls back to a server-generated id, which is
    // unique per attempt — correct for a first call, no protection on retry.
    const ref = typeof req.body?.requestId === 'string' && req.body.requestId
      ? `chat_${req.body.requestId.slice(0, 64)}`
      : `chat_${req.user.id}_${Date.now()}`

    try {
      // INSERT ... SELECT with the balance test in the WHERE: the row is only
      // written if the summed balance is still positive at write time. Returns
      // zero rows when the user is out of credits.
      //
      // Requires the unique index from 0043_credit_reservation_idempotency.sql
      // for the ON CONFLICT target to resolve.
      //
      // The `WHERE ref IS NOT NULL` on the conflict target is NOT optional and
      // is not the same clause as the one above it: 0043's index is PARTIAL, and
      // Postgres will only infer a partial index if the target repeats its
      // predicate. Without it every call dies with 42P10 "no unique or exclusion
      // constraint matching the ON CONFLICT specification".
      const { rows } = await pool.query(
        `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
         SELECT $1, -1, 'ai_query', $2
          WHERE COALESCE(
                  (SELECT SUM(amount) FROM public.credit_transactions WHERE user_id = $1),
                  0
                ) > 0
         ON CONFLICT (user_id, ref) WHERE ref IS NOT NULL DO NOTHING
         RETURNING id`,
        [req.user.id, ref],
      )

      if (!rows.length) {
        // Either out of credits, or this exact ref was already reserved (a
        // retry). Distinguish the two so a retry is not reported as "empty".
        const { rows: bal } = await pool.query(
          'SELECT balance FROM public.credit_balances WHERE user_id = $1',
          [req.user.id],
        )
        const balance = Number(bal[0]?.balance ?? 0)
        if (balance <= 0) {
          return res.status(402).json({
            error: "You're out of Ask AI messages.",
            code: 'NO_CREDITS',
            remaining: 0,
          })
        }
        // Balance is fine, so the insert was swallowed by ON CONFLICT — this
        // request id already bought its answer. Charge nothing further, and
        // leave creditRef null so a later failure refunds nothing.
        req.creditRef = null
      } else {
        // Handed to the route so it can refund on an upstream failure.
        req.creditRef = ref
      }
      next()
    } catch (e) {
      fail(res, 'requireCredits', e)
    }
  }
}

// Compensating entry for a reservation whose work never completed — a provider
// outage, a timeout, a tool-loop crash. Append-only means we cannot delete the
// -1; we add a +1 beside it, leaving both visible in the ledger.
//
// Best-effort by design: if the refund itself fails the user has lost one
// message, which is strictly better than the alternative (throwing here would
// replace a useful provider error with an opaque 500).
export async function refundCredit(pool, userId, ref) {
  if (!ref) return
  try {
    await pool.query(
      // Same partial-index predicate as the reservation above — see the note
      // there for why omitting it fails outright.
      `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
       VALUES ($1, 1, 'refund', $2)
       ON CONFLICT (user_id, ref) WHERE ref IS NOT NULL DO NOTHING`,
      [userId, `refund_${ref}`],
    )
  } catch (e) {
    console.error('refundCredit failed:', e)
  }
}

// --- Rate limiting --------------------------------------------------------------
// In-memory fixed window, keyed by user id (falls back to IP). Fine for a
// single Railway instance; move to Postgres/Redis if this scales to more.
//
// The IP fallback only works because server.js sets `trust proxy` — without it
// every request behind the load balancer shares one key. See the comment there.
export function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  }, windowMs).unref()

  return (req, res, next) => {
    const id = req.user?.id || req.ip
    const now = Date.now()
    const entry = hits.get(id)
    if (!entry || entry.reset < now) {
      hits.set(id, { count: 1, reset: now + windowMs })
      return next()
    }
    if (++entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000))
      return res.status(429).json({ error: 'Too many requests. Please slow down.' })
    }
    next()
  }
}
