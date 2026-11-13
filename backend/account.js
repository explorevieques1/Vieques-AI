/**
 * Account routes — self-serve deletion (DELETE /api/account).
 *
 * The privacy policy promises users can delete their account. Before this
 * route that meant "email us and we run SQL by hand", so in practice no one
 * could.
 *
 * WHAT ONE DELETE REMOVES
 * -----------------------
 * Every user-owned table in public references auth.users ON DELETE CASCADE,
 * so `DELETE FROM auth.users` alone wipes profiles, customers (the email copy),
 * credit_transactions, favorites, itineraries and ai_conversations, plus
 * Supabase's own sessions and identities. That also kills every refresh token
 * at once, and getUserFromAuthHeader() checks tokens against Supabase's server
 * (not just the signature), so the user's still-unexpired access token stops
 * working on the next request too.
 *
 * The three payment tables are the exception: migration 0050 switched them to
 * ON DELETE SET NULL so the sale survives as an anonymous row (amount, plan,
 * date, Stripe ids; no name or email). That is the "we keep payment records for
 * tax" promise in the privacy policy.
 *
 * OUTSIDE OUR DATABASE
 * --------------------
 *  - Stripe: the Customer object holds the email. stripe.customers.del()
 *    removes it; Stripe keeps the charges themselves, which is what we want.
 *  - Gemini: messages already sent cannot be recalled. The privacy policy
 *    says so rather than pretending otherwise.
 *
 * The backend connects as `postgres`, which holds DELETE on auth.users
 * (verified with has_table_privilege), so no service-role key is needed.
 */
import { requireAuth, rateLimit } from './middleware.js'
import { fail } from './httpError.js'
import { stripe } from './payments.js'

/** The Stripe customer id for this user, or null if they never checked out. */
async function findStripeCustomer(pool, userId) {
  const { rows } = await pool.query(
    'SELECT stripe_customer_id FROM public.customers WHERE user_id = $1',
    [userId]
  )
  return rows[0]?.stripe_customer_id ?? null
}

/**
 * Delete the auth user; the FK cascades handle every public table.
 * @returns {Promise<boolean>} false if no such user (already deleted).
 */
async function deleteAuthUser(pool, userId) {
  const { rowCount } = await pool.query('DELETE FROM auth.users WHERE id = $1', [userId])
  return rowCount > 0
}

/**
 * Delete the Stripe customer. "Already gone" counts as success, so a retried
 * deletion never fails on this step.
 */
async function deleteStripeCustomer(customerId) {
  try {
    await stripe.customers.del(customerId)
  } catch (e) {
    if (e?.code === 'resource_missing') return
    throw e
  }
}

/**
 * Guard: refuse to delete anyone until migration 0050 is live. Before it, the
 * payment tables still CASCADE, so a deletion would erase the anonymous
 * payment records the privacy policy promises to keep. Code and migrations
 * deploy separately, so this makes the order they land in irrelevant.
 * Caches only a positive answer — once applied, it never re-checks.
 */
let paymentsSurviveDeletion = false
async function migration0050Applied(pool) {
  if (paymentsSurviveDeletion) return true
  const { rows } = await pool.query(
    // count = 3 as well as bool_and: a renamed or missing FK must read as
    // "not applied", not be silently left out of the aggregate.
    `SELECT count(*) = 3 AND bool_and(confdeltype = 'n') AS ok
       FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conname IN ('fulfillments_user_id_fkey', 'subscriptions_user_id_fkey',
                        'ai_credit_purchases_user_id_fkey')`
  )
  paymentsSurviveDeletion = rows[0]?.ok === true
  return paymentsSurviveDeletion
}

export function mountAccount(app, pool) {
  // A tight limit: a real person deletes their account once. Anything faster
  // than this is a script with a stolen token.
  app.delete('/api/account', requireAuth, rateLimit({ windowMs: 60_000, max: 3 }), async (req, res) => {
    // The UI makes the user type DELETE. Checking it here too means a stray
    // call from a bug elsewhere in the client can't wipe an account.
    if (req.body?.confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm.' })
    }
    const userId = req.user.id

    try {
      if (!(await migration0050Applied(pool))) {
        console.error('DELETE /api/account refused: migration 0050 not applied')
        return res.status(503).json({
          error: 'Account deletion is temporarily unavailable. Email hello@explorevieques.org and we will delete it for you.',
        })
      }

      // ORDER: database first, Stripe second.
      //  - The customer id must be read BEFORE the delete: the cascade
      //    removes the customers row that holds it.
      //  - The database delete is the one that must succeed — it is what the
      //    user asked for, and it is what kills their sessions. If it throws,
      //    nothing has changed and the user can simply retry.
      //  - If Stripe then fails, the account is already gone and a retry is
      //    impossible (the token is dead), so we don't fail the request over
      //    it. We log the customer id loudly for manual cleanup instead.
      const customerId = await findStripeCustomer(pool, userId)
      await deleteAuthUser(pool, userId)

      if (customerId) {
        try {
          await deleteStripeCustomer(customerId)
        } catch (e) {
          console.error(`ACCOUNT DELETION: Stripe customer ${customerId} NOT deleted — remove by hand:`, e)
        }
      }
      return res.status(204).end()
    } catch (e) {
      return fail(res, 'DELETE /api/account', e)
    }
  })
}
