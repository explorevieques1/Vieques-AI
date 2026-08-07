// ============================================================================
//  httpError.js — one place to turn a caught exception into a 500 response
// ============================================================================
//  Lives in its own module rather than in middleware.js because payments.js
//  needs it too, and middleware.js already imports FROM payments.js. Putting it
//  there would close an import cycle.
// ============================================================================

/**
 * Log an exception server-side and return a generic 500 to the client.
 *
 * Routes used to do `res.status(500).json({ error: e.message })`. That hands a
 * raw Postgres or Stripe message straight to the browser — table names, column
 * names, constraint names, internal config — which is a free schema map for
 * anyone probing the API, and useless to a real user either way. The real error
 * belongs in the server log, where it can actually be read.
 *
 * @param {import('express').Response} res
 * @param {string} where  Label for the log line, usually the route or function
 *                        name. A stack alone does not say which request threw.
 * @param {unknown} e     The caught exception. Logged whole, never returned.
 */
export function fail(res, where, e) {
  console.error(`${where}:`, e)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
