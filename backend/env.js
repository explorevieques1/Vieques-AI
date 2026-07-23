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
// ============================================================================

import dotenv from 'dotenv'

// Reads the nearest `.env` file (if present) and merges it into process.env.
// No-op when the file is absent (e.g. on the Railway container).
dotenv.config()
