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
import { fail } from './httpError.js'

// Server-side Stripe client, built at import time.
//
// There is no `|| ''` fallback here any more. It used to be documented as
// letting the process boot without a key, but Stripe v22 throws
// "Neither apiKey nor config.authenticator provided" on an empty string just
// as it does on undefined — so the fallback bought nothing and cost a great
// deal: the throw comes from inside node_modules during module evaluation,
// naming neither STRIPE_SECRET_KEY nor this file, and Railway surfaces it as a
// bare failed health check.
//
// env.js now checks STRIPE_SECRET_KEY (and friends) before this module is ever
// evaluated, and exits with the variable named. Passing the value straight
// through keeps Stripe's own error as the backstop if that check is bypassed.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Where Stripe sends the browser back after checkout. Both /success and
// /pricing are LANDING routes (see landing/src/App.jsx) — the map app has no
// such routes, so sending Stripe to APP_URL drops the user on a blank map
// instead of the receipt page.
const LANDING_URL = process.env.LANDING_URL || 'http://localhost:5174'

// Supabase client used ONLY to verify a user's JWT (auth.getUser). The anon key
// is enough — verifying a token needs no elevated privileges, and we never use
// this client to read or write protected tables.
//
// Same story as the Stripe client above: createClient('', '') throws
// "supabaseUrl is required." at import, so the old `|| ''` guards only
// obscured which variable was missing. env.js validates both first.
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// ----------------------------------------------------------------------------
//  Plan catalog — the single source of truth for pricing
// ----------------------------------------------------------------------------
//  Defined server-side so the browser can never tamper with the price. The key
//  (e.g. "traveler") is what the frontend sends to /api/checkout and what rides
//  along in Stripe metadata to the webhook.
//
//  Field guide:
//    amount   — price in CENTS (1299 = $12.99).
//    mode     — 'payment' (one-time) or 'subscription' (recurring).
//    interval — billing period for subscriptions ('month').
//    tier     — feature level the map app gates on (see FEATURES below).
//    grants   — what fulfillment hands out on success:
//                 { type: 'access',  days, aiMessages } → time-boxed access,
//                       optionally pre-loaded with Ask AI messages
//                 { type: 'access' }          → open-ended (subscription-gated)
//                 { type: 'credits', amount } → top-up AI message pack
//                 { type: 'extend',  days }   → add days to an active pass
//
//  Pricing rationale for every number here lives in PRICING.md. If you change
//  an amount, change it there too — and remember landing/src/lib/plans.js
//  renders the *display* price, so it must be updated to match or the pricing
//  page will advertise one number and charge another.
//
//  Adding a plan key also requires widening the `plan` CHECK constraint on
//  public.subscriptions — see db/migrations/0021_pricing_tiers.sql. Without
//  that, checkout succeeds and fulfillment throws, so the customer pays and
//  gets nothing.
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------
export const PLANS = {
  // ── Travelers (one-time passes) ───────────────────────────────────────────
  day_trip: {
    name: 'Day Trip', amount: 799, mode: 'payment', tier: 'day_trip',
    description: 'Full island access for 24 hours',
    // days:1 is the 24 hours the page advertises. This previously read 2 while
    // every customer-facing surface said 24 hours — the grant is what actually
    // expires the pass, so it is the number that has to match the copy.
    grants: { type: 'access', days: 1, aiMessages: 0 },
  },
  vacation: {
    name: 'Vacation', amount: 1399, mode: 'payment', tier: 'vacation',
    description: 'Everything you need for your stay — 7 days, 25 Ask AI messages',
    grants: { type: 'access', days: 7, aiMessages: 25 },
  },
  exploration: {
    name: 'Exploration', amount: 2499, mode: 'payment', tier: 'exploration',
    description: 'Full access for 30 days, 150 Ask AI messages, itinerary builder',
    grants: { type: 'access', days: 30, aiMessages: 150 },
  },

  // ── Add-ons ───────────────────────────────────────────────────────────────
  credits: {
    name: 'AI Credit Pack', amount: 499, mode: 'payment',
    description: '30 more Ask AI messages. They never expire.',
    grants: { type: 'credits', amount: 30 },
  },
  extend: {
    name: 'Trip Extension', amount: 499, mode: 'payment',
    description: '7 more days on your current pass',
    grants: { type: 'extend', days: 7 },
  },
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  // ----------------------------------------------------------------------------
  // ── Businesses (recurring) ────────────────────────────────────────────────
  business_basic: {
    name: 'Basic', amount: 1900, mode: 'subscription', interval: 'month', tier: 'basic',
    description: 'Your business on the map with a full profile',
    grants: { type: 'access' },
  },
  business_featured: {
    name: 'Featured', amount: 5900, mode: 'subscription', interval: 'month', tier: 'featured',
    description: 'Featured badge, spotlight slots, and engagement analytics',
    grants: { type: 'access' },
  },
  business_partner: {
    name: 'Island Partner', amount: 14900, mode: 'subscription', interval: 'month', tier: 'partner',
    description: 'Up to 5 locations, homepage placement, full analytics',
    grants: { type: 'access' },
  },
}

// ----------------------------------------------------------------------------
//  Feature gating — what each tier can actually reach
// ----------------------------------------------------------------------------
//  Server-side answer to "is this user allowed to see snorkel zones?". The map
//  app mirrors these for UI purposes, but the browser copy is advisory only:
//  routes must check FEATURES, never trust what the client claims to hold.
//
//  'free' is the tier for a signed-in user with no active purchase. It grants
//  NOTHING. Creating an account is identity, not access: the map requires at
//  minimum a Day Trip pass. An empty free list is what makes that true on the
//  server — every requireTier() gate resolves through this map, so a tier with
//  no slugs fails every one of them.
//
//  The 'free' KEY must stay. bestTier() returns it for a user with no active
//  subscription and tierHas() falls back to it for an unknown tier, so deleting
//  the key would turn both into a crash instead of a denial.
//
//  'restaurant_preview' and 'stay_preview' remain on the paid tiers' arrays via
//  the ['restaurant_preview', 'restaurants'] pattern at their routes. They are
//  no longer reachable without a pass, but removing the slugs would mean
//  rewriting those call sites for no behavioural gain.
// ----------------------------------------------------------------------------
export const FEATURES = {
  free:        [],
  day_trip:    ['map', 'search', 'beach_names', 'beach_profiles', 'restaurants', 'stays', 'essentials',
                'transport', 'activities', 'filters', 'directions', 'road_conditions',
                'snorkel_zones_preview', 'favorites'],
  vacation:    ['map', 'search', 'beach_names', 'beach_profiles', 'restaurants', 'stays', 'essentials',
                'transport', 'activities', 'filters', 'directions', 'road_conditions',
                'snorkel_zones', 'snorkel_detail', 'kayak_zones', 'biobay_guide', 'favorites',
                'ai_chat', 'ai_history', 'support'],
  exploration: ['map', 'search', 'beach_names', 'beach_profiles', 'restaurants', 'stays', 'essentials',
                'transport', 'activities', 'filters', 'directions', 'road_conditions',
                'snorkel_zones', 'snorkel_detail', 'kayak_zones', 'biobay_guide', 'favorites',
                'ai_chat', 'ai_history', 'support', 'support_priority',
                'itinerary', 'itinerary_export'],
}

/** Device limit per tier — see PRICING.md §4. */
export const DEVICE_LIMITS = { free: 1, day_trip: 1, vacation: 2, exploration: 5 }

/**
 * Does a tier include a feature?
 *
 * @param {string} tier     One of the FEATURES keys; unknown tiers get 'free'.
 * @param {string} feature  A feature slug from the FEATURES lists.
 * @returns {boolean}
 */
export function tierHas(tier, feature) {
  return (FEATURES[tier] || FEATURES.free).includes(feature)
}

/**
 * Collapse a user's active subscription rows into the single best tier they
 * hold. A user can legitimately hold more than one (they bought Day Trip, then
 * upgraded to Vacation) — the most generous one wins.
 *
 * @param {Array<{ plan: string }>} rows  Active subscription rows.
 * @returns {string} A FEATURES key.
 */
export function bestTier(rows = []) {
  const rank = { free: 0, day_trip: 1, vacation: 2, exploration: 3 }
  let best = 'free'
  for (const r of rows) {
    const tier = PLANS[r.plan]?.tier
    if (tier && rank[tier] > rank[best]) best = tier
  }
  return best
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
      success_url: `${LANDING_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${LANDING_URL}/pricing?checkout=cancel`,
    })

    res.json({ url: session.url })
  } catch (e) {
    // Log the full error, return a fixed string. A Stripe exception message can
    // name internal resources and config; the browser has no use for it.
    console.error('checkout error:', e)
    res.status(500).json({ error: 'Could not start checkout. Please try again.' })
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

    // ---- Failed / abandoned AI credit purchases --------------------------
    // These events grant NOTHING — they exist purely so the purchase history
    // can show a denied or abandoned attempt instead of silently omitting it.
    // Before this, a declined card left no trace anywhere in the database.
    //
    // Scoped to credit plans on purpose: this table is the AI-spending
    // receipt book. A failed pass purchase is out of scope here (fulfillments
    // remains the all-plans audit log).
    if (event.type === 'checkout.session.async_payment_failed' ||
        event.type === 'checkout.session.expired') {
      const session = event.data.object
      const status = event.type === 'checkout.session.expired' ? 'expired' : 'denied'
      await recordFailedCreditPurchase(pool, {
        session,
        status,
        reason: session.last_payment_error?.message || null,
      })
    }

    // payment_intent.payment_failed is the event a declined card actually
    // fires for a standard (non-async) checkout. It carries no session, so we
    // match on the PaymentIntent id recorded at fulfillment/checkout time —
    // that is what idx_ai_credit_purchases_pi exists for. If no row matches,
    // this was not a credit purchase and the UPDATE affects nothing.
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object
      const reason = pi.last_payment_error?.message
        || pi.last_payment_error?.code
        || null
      await pool.query(
        `UPDATE public.ai_credit_purchases
            SET status = 'denied', failure_reason = $2
          WHERE stripe_payment_intent_id = $1
            AND status <> 'confirmed'`,
        [pi.id, reason],
      )
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
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}

/**
 * Record an AI credit purchase that did NOT succeed.
 *
 * Grants nothing and touches no ledger — the only effect is a visible row in
 * the purchase history so a decline or an abandoned checkout is something the
 * user (and support) can see, rather than an absence.
 *
 * WHY IT CAN INSERT AND NOT ONLY UPDATE. For a standard card checkout there is
 * no earlier row to update: fulfill() never ran, so nothing was ever written.
 * The failure event is the FIRST time this session is seen, which is why the
 * plan/credits/price are reconstructed from metadata + the PLANS catalog here.
 *
 * WHY IT NEVER OVERWRITES A CONFIRMED ROW. Stripe's ordering is not guaranteed,
 * and `checkout.session.expired` can arrive for a session that also completed.
 * The WHERE on DO UPDATE makes a paid purchase terminal: once 'confirmed', no
 * later failure event can flip it and make granted credits look unpaid.
 *
 * @param {import('pg').Pool} pool
 * @param {{ session: object, status: 'denied'|'expired', reason: string|null }} ctx
 */
async function recordFailedCreditPurchase(pool, { session, status, reason }) {
  const userId = session.metadata?.supabase_user_id
  const planKey = session.metadata?.plan
  const plan = PLANS[planKey]

  // Only AI credit packs belong in this table. Anything else — a pass, an
  // extension, or a session with metadata we can't trust — is ignored.
  if (!userId || !plan || plan.grants?.type !== 'credits') return

  await pool.query(
    `INSERT INTO public.ai_credit_purchases
       (user_id, stripe_session_id, stripe_payment_intent_id, plan,
        credits, amount_cents, currency, status, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (stripe_session_id) DO UPDATE
       SET status = EXCLUDED.status,
           failure_reason = EXCLUDED.failure_reason,
           stripe_payment_intent_id =
             COALESCE(EXCLUDED.stripe_payment_intent_id,
                      public.ai_credit_purchases.stripe_payment_intent_id)
     WHERE public.ai_credit_purchases.status <> 'confirmed'`,
    [
      userId,
      session.id,
      session.payment_intent || null,
      planKey,
      plan.grants.amount,
      session.amount_total ?? plan.amount,
      session.currency || 'usd',
      status,
      reason,
    ],
  )
}

/**
 * Grant whatever a plan promised, inside a single DB transaction.
 *
 * IDEMPOTENCY. Stripe delivers webhooks at-least-once (it retries on timeout,
 * and can redeliver), so every grant must be safe to replay. The guard is the
 * INSERT into `fulfillments` below: a unique index on stripe_session_id means a
 * concurrent or later redelivery loses the race *in the database*, gets
 * rowCount 0, and returns without granting anything. Doing the check as an
 * INSERT rather than a SELECT-then-INSERT is what makes it atomic.
 *
 * WHY `fulfillments` AND NOT `subscriptions` (db/migrations/0042).
 * This guard used to be the INSERT into `subscriptions`, which forced every
 * purchase to manufacture a subscription row just to have something to key on.
 * For the two add-ons that was actively wrong: neither confers a pass, but both
 * got a row with a NULL expires_at — and NULL means *open-ended* to
 * getEntitlement() and requireEntitlement(). A $4.99 credit pack therefore
 * bought permanent access worth $24.99. Separating "was this session
 * processed?" from "does this user hold a pass?" is what fixes it.
 *
 * WHAT EACH GRANT SHAPE DOES NOW — exactly one of:
 *   • access  → INSERT a subscriptions row (expiry set for time-boxed plans,
 *               NULL only for genuine open-ended subscription plans), plus any
 *               bundled AI messages.
 *   • credits → INSERT a credit_transactions row ONLY. No subscriptions row.
 *   • extend  → UPDATE an existing pass's expiry ONLY. No subscriptions row.
 *
 * Any failure rolls the whole thing back, including the fulfillments row, so a
 * failed delivery is retried rather than being recorded as done.
 *
 * @param {import('pg').Pool} pool
 * @param {{ userId: string, planKey: string, plan: object, session: object }} ctx
 */
async function fulfill(pool, { userId, planKey, plan, session }) {
  // Grab one dedicated connection so BEGIN/COMMIT stay on the same session.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const grantType = plan.grants?.type

    // ---- The idempotency guard -------------------------------------------
    // Claim this Stripe session before doing anything that grants value. A
    // redelivery loses here and we return having changed nothing. `outcome` is
    // corrected below once we know what actually applied.
    const claimed = await client.query(
      `INSERT INTO public.fulfillments
         (stripe_session_id, user_id, plan, outcome, amount_total)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [session.id, userId, planKey, grantType || 'noop', session.amount_total ?? null],
    )
    if (claimed.rowCount === 0) { await client.query('COMMIT'); return }

    // ---- access: the only shape that confers a pass ----------------------
    if (grantType === 'access') {
      // Time-boxed passes get an expiry. NULL is reserved for genuinely
      // open-ended plans (recurring subscriptions, governed by Stripe status)
      // — it must never be reachable by an add-on.
      const expiresAt = plan.grants.days
        ? new Date(Date.now() + plan.grants.days * 86400_000) // days → ms
        : null

      await client.query(
        `INSERT INTO public.subscriptions
           (user_id, plan, status, expires_at,
            stripe_customer_id, stripe_subscription_id, stripe_session_id)
         VALUES ($1, $2, 'active', $3, $4, $5, $6)
         ON CONFLICT (stripe_session_id) DO NOTHING`,
        [userId, planKey, expiresAt, session.customer, session.subscription || null, session.id],
      )

      // Bundled Ask AI allowance (vacation = 25, exploration = 150).
      const bundled = plan.grants.aiMessages || 0
      if (bundled > 0) {
        await client.query(
          `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
           VALUES ($1, $2, 'purchase', $3)`,
          [userId, bundled, session.id],
        )
      }
    }

    // ---- credits: ledger only, never a subscriptions row ------------------
    else if (grantType === 'credits') {
      await client.query(
        `INSERT INTO public.credit_transactions (user_id, amount, reason, ref)
         VALUES ($1, $2, 'purchase', $3)`,
        [userId, plan.grants.amount, session.id],
      )

      // The user-facing receipt (db/migrations/0044). Same transaction as the
      // ledger grant above, so the two can never disagree about whether this
      // purchase happened: status 'confirmed' here always has a matching +N
      // credit_transactions row, because they commit or roll back together.
      //
      // UPSERT rather than plain INSERT because a session that took the async
      // route may already have a 'pending' row from checkout.session.expired's
      // sibling events; a completed payment is the terminal truth and wins.
      await client.query(
        `INSERT INTO public.ai_credit_purchases
           (user_id, stripe_session_id, stripe_payment_intent_id, plan,
            credits, amount_cents, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed')
         ON CONFLICT (stripe_session_id) DO UPDATE
           SET status = 'confirmed',
               failure_reason = NULL,
               stripe_payment_intent_id =
                 COALESCE(EXCLUDED.stripe_payment_intent_id,
                          public.ai_credit_purchases.stripe_payment_intent_id)`,
        [
          userId,
          session.id,
          session.payment_intent || null,
          planKey,
          plan.grants.amount,
          // Prefer what Stripe actually charged; fall back to the catalog
          // price so the column stays NOT NULL even on a sparse test event.
          session.amount_total ?? plan.amount,
          session.currency || 'usd',
        ],
      )
    }

    // ---- extend: mutate an existing pass, never create one -----------------
    else if (grantType === 'extend') {
      // Guarded to active, unexpired rows so it cannot resurrect a lapsed pass.
      // If the user holds nothing, this legitimately affects 0 rows — recorded
      // as 'noop' so the mismatch is visible when reconciling against Stripe
      // rather than silently swallowed. (Worth a refund follow-up: they paid
      // for days they could not receive.)
      const extended = await client.query(
        `UPDATE public.subscriptions
            SET expires_at = expires_at + ($2 || ' days')::interval
          WHERE user_id = $1 AND status = 'active'
            AND expires_at IS NOT NULL AND expires_at > now()`,
        [userId, String(plan.grants.days)],
      )
      if (extended.rowCount === 0) {
        await client.query(
          `UPDATE public.fulfillments SET outcome = 'noop' WHERE stripe_session_id = $1`,
          [session.id],
        )
        console.warn(`extend purchased with no active pass: user=${userId} session=${session.id}`)
      }
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
/**
 * AI credit purchase history — handler for GET /api/credits/history.
 *
 * Returns the signed-in user's AI credit purchases newest-first, including the
 * ones that failed. This reads over the pg pool (which bypasses RLS), so the
 * `WHERE user_id = $1` below is the ONLY thing scoping the result to the
 * caller — it is load-bearing, not decorative. The user id comes from the
 * verified JWT and never from the request.
 *
 * `amount_cents` is sent through as cents, not a formatted dollar string:
 * currency formatting is a display concern and belongs where the locale is
 * known, not baked into the API response.
 *
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req   Auth: Bearer JWT.
 * @param {import('express').Response} res
 */
export async function getCreditHistory(pool, req, res) {
  try {
    const user = await getUserFromAuthHeader(req)
    if (!user) return res.status(401).json({ error: 'Not signed in' })

    const { rows } = await pool.query(
      `SELECT id, plan, credits, amount_cents, currency, status,
              failure_reason, created_at
         FROM public.ai_credit_purchases
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [user.id],
    )

    // Only confirmed purchases represent credits the user actually received,
    // so that is the only subtotal worth reporting. Summing every row would
    // count declined cards as credits bought.
    const totals = rows.reduce((acc, r) => {
      if (r.status === 'confirmed') {
        acc.creditsPurchased += r.credits
        acc.spentCents += r.amount_cents
      }
      return acc
    }, { creditsPurchased: 0, spentCents: 0 })

    res.json({ purchases: rows, ...totals })
  } catch (e) {
    fail(res, 'getCreditHistory', e)
  }
}

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

    // Everyone signed in gets at least the free tier — the map is visible to
    // all, and the tier decides how much of it resolves. `hasAccess` stays as
    // "holds a paid pass" for the callers that already depend on that meaning.
    const tier = bestTier(rows)

    res.json({
      hasAccess: rows.length > 0,
      tier,
      features: FEATURES[tier] || FEATURES.free,
      deviceLimit: DEVICE_LIMITS[tier] ?? 1,
      plans: rows,
      credits: bal[0]?.balance ?? 0,
    })
  } catch (e) {
    fail(res, 'getEntitlement', e)
  }
}