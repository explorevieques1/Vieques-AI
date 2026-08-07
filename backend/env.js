// ============================================================================
//  env.js — Environment bootstrap (load .env before anything else runs)
// ============================================================================
//
//  WHY THIS FILE EXISTS
//  --------------------
//  Node evaluates `import` statements top-to-bottom, and some modules read
//  `process.env` the moment they are imported (payments.js builds its Stripe
//  client at import time, for example). If `.env` isn't loaded yet, those
//  reads see `undefined` and the app boots with empty credentials.
//
//  By importing THIS file first in server.js:
//
//      import './env.js'   // must be the very first import
//
//  we guarantee `dotenv.config()` runs — and populates `process.env` — before
//  any other module has a chance to read a variable.
//
//  DEPLOYMENT NOTE (Railway / Render)
//  ----------------------------------
//  In production there is usually NO `.env` file on disk; the host injects the
//  variables directly into the process environment. `dotenv.config()` simply
//  finds no file and does nothing — which is exactly what we want. The real
//  values come from the host's "Variables" panel. See `.env.example` for the
//  full checklist of what the deploy needs.
//
//  WHY THIS FILE ALSO VALIDATES
//  ----------------------------
//  Loading `.env` is not enough, because the SDKs we construct at import time
//  refuse to be built without credentials:
//
//    new Stripe('')                      -> throws "Neither apiKey nor
//                                           config.authenticator provided"
//    createClient('', '')                -> throws "supabaseUrl is required."
//
//  Both throw from inside `node_modules` during module evaluation, so the
//  stack names neither the missing variable nor the file that wanted it. On
//  Railway that surfaces as nothing but a failed health check — the actual
//  cause is one line in a build log nobody reads.
//
//  So we fail deliberately instead: check every required key here, and print
//  ALL the missing ones at once. One deploy, one fix list, rather than
//  discovering them one restart at a time.
// ============================================================================

import dotenv from 'dotenv'

// Reads the nearest `.env` file (if present) and merges it into process.env.
// No-op when the file is absent (e.g. on the Railway container).
dotenv.config()

// ----------------------------------------------------------------------------
//  Required variables
// ----------------------------------------------------------------------------
//  Listed here ONLY if the process genuinely cannot serve its core job without
//  them. The bar is deliberately high: a variable that merely disables one
//  optional feature belongs in OPTIONAL below, not here — a deploy that dies
//  because Tripadvisor enrichment is unconfigured is a worse outcome than one
//  that serves stays without ratings.
//
//  The `why` text is printed to the operator, so it names the consequence
//  rather than restating the variable.
// ----------------------------------------------------------------------------
const REQUIRED = [
  {
    key: 'STRIPE_SECRET_KEY',
    why: 'payments.js constructs the Stripe client at import; without it the process cannot start',
  },
  {
    key: 'SUPABASE_URL',
    why: 'used to verify user JWTs on every protected route',
  },
  {
    key: 'SUPABASE_ANON_KEY',
    why: 'used to verify user JWTs on every protected route',
  },
]

// Required in production only. Locally the code has working fallbacks
// (DB_* -> localhost, LANDING_URL/APP_URL -> the Vite dev ports), and demanding
// them would break `npm start` on a laptop for no benefit. In production those
// same fallbacks are all wrong, and silently so.
const REQUIRED_IN_PRODUCTION = [
  {
    key: 'DATABASE_URL',
    why: 'without it the pool silently falls back to localhost:5432 and every query fails',
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    why: 'webhook signature verification fails closed, so paid customers are never granted access',
  },
  {
    key: 'LANDING_URL',
    why: 'CORS allowlist and Stripe return URLs both derive from it',
  },
  {
    key: 'APP_URL',
    why: 'CORS allowlist for the map app derives from it',
  },
]

// Not validated, by design — each is handled where it is used, and the
// degradation is intentional:
//   GEMINI_API_KEY / OPENAI_API_KEY  aiProvider.js throws a named error at call
//                                    time, so Ask AI 500s but the map serves.
//   ANTHROPIC_API_KEY                itinerary builder only; the SDK accepts an
//                                    empty key and fails lazily at request time.
//   TRIPADVISOR_API_KEY              absent = stays render without the ratings
//                                    block (documented in .env.example).
//   PORT                             injected by the host; falls back to 3001.

const missing = [
  ...REQUIRED,
  ...(process.env.NODE_ENV === 'production' ? REQUIRED_IN_PRODUCTION : []),
].filter(({ key }) => !process.env[key]?.trim())

if (missing.length > 0) {
  const inProd = process.env.NODE_ENV === 'production'
  console.error(
    [
      '',
      '  Startup aborted — missing required environment variables',
      '  ' + '─'.repeat(56),
      ...missing.map(({ key, why }) => `    ${key}\n        ${why}`),
      '',
      inProd
        ? '  Set these in your host\'s Variables panel (Railway: service → Variables),'
        : '  Add these to backend/.env (copy backend/.env.example to start).',
      inProd ? '  then redeploy.' : '',
      `  NODE_ENV=${process.env.NODE_ENV || '(unset — treated as development)'}`,
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  // Exit before any SDK is constructed, so the operator sees the list above
  // rather than an SDK's constructor throwing from inside node_modules.
  process.exit(1)
}
