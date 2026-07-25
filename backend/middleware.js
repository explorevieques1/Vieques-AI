// ============================================================================
//  middleware.js — auth, entitlement, and rate limiting for protected routes
// ============================================================================
//  Closes SECURITY.md Finding 1: /api/ai/chat had no authentication at all, so
//  anyone on the internet could spend the Anthropic balance. A route that does
//  not use requireAuth has NO authentication — CORS does not count (it only
//  stops browser JS from other origins, not curl/scripts).
// ============================================================================
import { getUserFromAuthHeader } from './payments.js'

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
