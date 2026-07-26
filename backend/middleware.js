// ============================================================================
//  middleware.js — auth, entitlement, and rate limiting for protected routes
// ============================================================================
//  Closes SECURITY.md Finding 1: /api/ai/chat had no authentication at all, so
//  anyone on the internet could spend the Anthropic balance. A route that does
//  not use requireAuth has NO authentication — CORS does not count (it only
//  stops browser JS from other origins, not curl/scripts).
// ============================================================================
import { getUserFromAuthHeader, bestTier, tierHas } from './payments.js'

// --- Authentication ----------------------------------------------------------
// Verifies the Supabase JWT via getUserFromAuthHeader and attaches req.user.
export async function requireAuth(req, res, next) {
  const user = await getUserFromAuthHeader(req)
  if (!user) return res.status(401).json({ error: 'Not signed in' })
  req.user = user
  next()
}

// --- Entitlement --------------------------------------------------------------
// Server-side paywall check. Must run AFTER requireAuth (needs req.user).
export function requireEntitlement(pool) {
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM public.subscriptions
         WHERE user_id = $1 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
        [req.user.id],
      )
      if (!rows.length) {
        return res.status(402).json({ error: 'This feature requires an active plan.' })
      }
      next()
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }
}

// --- Tier gating ---------------------------------------------------------------
// Graduated replacement for requireEntitlement. Where requireEntitlement asks
// "have you paid at all?", this asks "does your plan include THIS feature?" —
// the check PRICING.md's ladder needs. Must run AFTER requireAuth.
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
      res.status(500).json({ error: e.message })
    }
  }
}

// --- Credit gating --------------------------------------------------------------
// The Ask AI gate. Entitlement is the WRONG check for AI in both directions:
// Day Trip holds an active subscription but is allocated 0 messages, while the
// free tier holds no subscription but gets 3. Only the ledger balance answers
// this correctly.
//
// Balance comes from the credit_balances view (SUM over the append-only
// ledger). Does not deduct — the handler does that AFTER a successful
// completion, so an upstream failure never burns a user's message.
export function requireCredits(pool) {
  return async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT balance FROM public.credit_balances WHERE user_id = $1',
        [req.user.id],
      )
      const balance = Number(rows[0]?.balance ?? 0)
      if (balance <= 0) {
        return res.status(402).json({
          error: "You're out of Ask AI messages.",
          code: 'NO_CREDITS',
          remaining: 0,
        })
      }
      req.credits = balance
      next()
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }
}

// --- Rate limiting --------------------------------------------------------------
// In-memory fixed window, keyed by user id (falls back to IP). Fine for a
// single Railway instance; move to Postgres/Redis if this scales to more.
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
