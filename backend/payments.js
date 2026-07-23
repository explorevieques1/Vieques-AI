// ============================================================================
//  payments.js — Payment engine (Stripe + entitlement fulfillment)
// ============================================================================
//
//  All Stripe secret-key work and webhook fulfillment lives here. Two rules
//  make this the security backbone of the paywall:
//
//    1. The browser NEVER sees the Stripe secret key. It only ever gets a
//       hosted-checkout URL back from /api/checkout.
//    2. A user can NEVER grant themselves access. Entitlements (the
//       `subscriptions` / `credit_transactions` rows) are written ONLY by the
//       Stripe webhook — a server-to-server call Stripe signs. We write those
//       rows over the direct `pg` pool, which connects as the database owner
//       and therefore BYPASSES Row Level Security (unlike the anon key the
//       browser uses).
//
//  REQUEST FLOW
//  ------------
//    Browser → POST /api/checkout ─────────────► Stripe Checkout (hosted page)
//                                                       │  user pays
//                                                       ▼
//    Stripe → POST /api/stripe/webhook ──► handleWebhook() ──► fulfill()
//                                                       │  writes the grant
//                                                       ▼
//    Browser → GET /api/entitlement ────────► getEntitlement() reads the grant
//
//  DEPLOYMENT NOTE: the webhook needs a stable, always-on public URL and the
//  STRIPE_WEBHOOK_SECRET from the Stripe dashboard. See CLAUDE.md → Known gaps.
// ============================================================================

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Server-side Stripe client. `|| ''` lets the process boot even if the key is
// unset (individual requests fail instead of crashing on startup).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

// Where Stripe sends the browser back after checkout (success/cancel pages).
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

// Supabase client used ONLY to verify a user's JWT (auth.getUser). The anon key
// is enough — verifying a token needs no elevated privileges, and we never use
// this client to read or write protected tables.
const supabaseAuth = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
)

// ----------------------------------------------------------------------------
//  Plan catalog — the single source of truth for pricing
// ----------------------------------------------------------------------------
//  Defined server-side so the browser can never tamper with the price. The key
//  (e.g. "traveler") is what the frontend sends to /api/checkout and what rides
//  along in Stripe metadata to the webhook.
//
//  Field guide:
//    amount   — price in CENTS (900 = $9.00).
//    mode     — 'payment' (one-time) or 'subscription' (recurring).
//    interval — billing period for subscriptions ('month').
//    grants   — what fulfillment hands out on success:
//                 { type: 'access',  days }   → time-boxed island access
//                 { type: 'access' }          → open-ended (subscription-gated)
//                 { type: 'credits', amount } → pay-as-you-go AI query credits
// ----------------------------------------------------------------------------
export const PLANS = {
  traveler:          { name: 'Traveler Plan', amount: 900,  mode: 'payment',      description: 'Full island access for your trip', grants: { type: 'access', days: 30 } },
  credits:           { name: 'Credit Pack',   amount: 300,  mode: 'payment',      description: 'Pay-as-you-go AI queries',         grants: { type: 'credits', amount: 20 } },
  business_basic:    { name: 'Basic Plan',    amount: 2900, mode: 'subscription', description: 'Get your business on the map', interval: 'month', grants: { type: 'access' } },
  business_featured: { name: 'Featured',      amount: 7900, mode: 'subscription', description: 'Priority placement',           interval: 'month', grants: { type: 'access' } },
}

/**
 * Verify the Supabase JWT the frontend sends in `Authorization: Bearer <jwt>`.
 *
 * This is the trust anchor for the whole payment flow: we NEVER take a user id
 * or email from the request body, because a caller could forge those. Only a
 * token Supabase can validate ties a payment to a real, authenticated account.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ id: string, email: string }|null>} The user, or null if
 *          the header is missing/invalid.
 */
export async function getUserFromAuthHeader(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return null
  return { id: data.user.id, email: data.user.email }
}

/**
 * Return the user's Stripe customer id, creating (and persisting) one if needed.
 *
 * Kept in the `customers` table so a returning buyer reuses the same Stripe
 * customer — that keeps their payment history and subscriptions under one
 * record instead of spawning a new customer on every checkout.
 *
 * @param {import('pg').Pool} pool
 * @param {{ id: string, email: string }} user
 * @returns {Promise<string>} The Stripe customer id.
 */
async function resolveStripeCustomer(pool, user) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id FROM public.customers WHERE user_id = $1',
    [user.id]
  )
  if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  })

  await pool.query(
    `INSERT INTO public.customers (user_id, stripe_customer_id, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id`,
    [user.id, customer.id, user.email]
  )
  return customer.id
}

/**
 * Create a Stripe Checkout session — handler for POST /api/checkout.
 *
 * Validates the plan, requires an authenticated user, resolves their Stripe
 * customer, and builds a hosted Checkout session. The chosen plan + user id are
 * stashed in `metadata` so the webhook knows WHO to grant WHAT after payment.
 * Responds with `{ url }` for the browser to redirect to.
 *
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req   Body: { plan: keyof PLANS }
 * @param {import('express').Response} res
 */
export async function createCheckoutSession(pool, req, res) {
  try {
    const plan = PLANS[req.body?.plan]
    if (!plan) return res.status(400).json({ error: 'Unknown plan' })

    // Must be a logged-in user — otherwise we can't grant access after payment.
    const user = await getUserFromAuthHeader(req)
    if (!user) return res.status(401).json({ error: 'Please sign in before checking out.' })

    const customerId = await resolveStripeCustomer(pool, user)

    const price_data = {
      currency: 'usd',
      product_data: { name: plan.name, description: plan.description },
      unit_amount: plan.amount,
    }
    if (plan.mode === 'subscription') {
      price_data.recurring = { interval: plan.interval || 'month' }
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan.mode,
      customer: customerId,
      line_items: [{ price_data, quantity: 1 }],
      // This metadata is the ONLY link between the payment and the account —
      // the webhook reads it back to decide who gets access and to which plan.
      metadata: { supabase_user_id: user.id, plan: req.body.plan },
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?checkout=cancel`,
    })

    res.json({ url: session.url })
  } catch (e) {
    console.error('checkout error:', e.message)
    res.status(500).json({ error: e.message })
  }
}

/**
 * Stripe webhook handler — the ONLY place access/credits are ever granted.
 *
 * Mounted in server.js with express.raw() so `req.body` is the untouched Buffer
 * Stripe signed. We first verify that signature (rejecting forgeries with 400),
 * then act on the events we care about:
 *
 *   • checkout.session.completed        → grant the purchased plan (fulfill()).
 *   • customer.subscription.updated     → keep local subscription status in sync
 *   • customer.subscription.deleted     →   (active / past_due / canceled).
 *
 * Always responds 2xx on success so Stripe stops retrying; 400/500 tells Stripe
 * to retry later.
 *
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req   Raw-body request from Stripe.
 * @param {import('express').Response} res
 */
export async function handleWebhook(pool, req, res) {
  let event
  try {
    // Verify authenticity: only Stripe knows STRIPE_WEBHOOK_SECRET, so a valid
    // signature proves this event really came from Stripe (not a forged POST).
    event = stripe.webhooks.constructEvent(
      req.body, // raw Buffer, thanks to express.raw()
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('webhook signature failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    // Payment completed → hand out whatever the plan promised.
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.supabase_user_id
      const planKey = session.metadata?.plan
      const plan = PLANS[planKey]
      if (userId && plan) {
        await fulfill(pool, { userId, planKey, plan, session })
      }
    }

    // Keep subscription status in sync (cancels, failed renewals, etc.)
    if (event.type === 'customer.subscription.deleted' ||
        event.type === 'customer.subscription.updated') {
      const sub = event.data.object
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active'
                   : sub.status === 'past_due' ? 'past_due' : 'canceled'
      await pool.query(
        `UPDATE public.subscriptions SET status = $1 WHERE stripe_subscription_id = $2`,
        [status, sub.id]
      )
    }

    res.json({ received: true })
  } catch (e) {
    console.error('webhook handling error:', e.message)
    res.status(500).json({ error: e.message })
  }
}

/**
 * Grant whatever a plan promised, inside a single DB transaction.
 *
 * IDEMPOTENT by design: Stripe delivers webhooks at-least-once (it retries on
 * timeout), so we key on `stripe_session_id` and bail early if that session was
 * already fulfilled — otherwise a retry would grant access twice or double the
 * credits. Access plans write a `subscriptions` row (with an expiry for
 * time-boxed plans); credit packs additionally write a `credit_transactions`
 * row. Any failure rolls the whole thing back.
 *
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, planKey: string, plan: object, session: object }} ctx
 */
async function fulfill(pool, { userId, planKey, plan, session }) {
  // Grab one dedicated connection so BEGIN/COMMIT stay on the same session.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Duplicate-delivery guard: if this checkout session was already recorded,
    // commit the no-op and return so retries don't double-grant.
    const dup = await client.query(
      'SELECT 1 FROM public.subscriptions WHERE stripe_session_id = $1',
      [session.id]
    )
    if (dup.rowCount > 0) { await client.query('COMMIT'); return }

    // Time-boxed access (e.g. traveler = 30 days) gets an expiry; subscription
    // access is open-ended (null) and governed by Stripe's subscription status.
    const expiresAt =
      plan.grants?.type === 'access' && plan.grants?.days
        ? new Date(Date.now() + plan.grants.days * 86400_000) // days → ms
        : null

    await client.query(
      `INSERT INTO public.subscriptions
         (user_id, plan, status, expires_at,
          stripe_customer_id, stripe_subscription_id, stripe_session_id)
       VALUES ($1, $2, 'active', $3, $4, $5, $6)`,
      [userId, planKey, expiresAt, session.customer, session.subscription || null, session.id]
    )

    if (plan.grants?.type === 'credits') {
      await client.query(
        `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
         VALUES ($1, $2, 'purchase', $3)`,
        [userId, plan.grants.amount, session.id]
      )
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * Entitlement check — handler for GET /api/entitlement.
 *
 * The map app's paywall calls this to decide whether to let the user in. Looks
 * for any active, non-expired subscription plus the user's credit balance.
 * Responds with:
 *   { hasAccess: boolean, plans: [...activeRows], credits: number }
 *
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req   Auth: Bearer JWT.
 * @param {import('express').Response} res
 */
export async function getEntitlement(pool, req, res) {
  try {
    const user = await getUserFromAuthHeader(req)
    if (!user) return res.status(401).json({ error: 'Not signed in' })

    const { rows } = await pool.query(
      `SELECT plan, status, expires_at FROM public.subscriptions
       WHERE user_id = $1 AND status = 'active'
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC`,
      [user.id]
    )
    const { rows: bal } = await pool.query(
      'SELECT balance FROM public.credit_balances WHERE user_id = $1',
      [user.id]
    )

    res.json({
      hasAccess: rows.length > 0,
      plans: rows,
      credits: bal[0]?.balance ?? 0,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}