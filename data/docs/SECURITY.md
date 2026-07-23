# Explore Vieques — Security & Data Integrity Guide

Companion to [CLAUDE.md](CLAUDE.md). That file explains **what the system is**. This one
explains **what holds it together, where it currently leaks, and how to see inside it**.

Audit performed **2026-07-22** against live production
(`https://explore-vieques-production.up.railway.app`) and the live Supabase project
`explorevieques_db` (`dbotrrrbqwgzccuiylef`). Every finding below was **verified**, not
guessed — the evidence is included so you can re-run it yourself.

---

## Part 1 — What the Gatekeeper rule actually means

CLAUDE.md states it in one line:

> **Gatekeeper rule:** the browser never talks to Postgres, Stripe, or Claude directly.
> All of that goes through `backend/`. Row Level Security protects identity/payment tables.

That sentence is doing a lot of work. Unpacked, it is really **four separate defenses**,
and they fail independently. Knowing which one you're relying on for any given piece of
data is the whole skill.

### The four trust boundaries

```
┌─ Boundary 1: THE BROWSER ─────────────────────────────────────────────┐
│  Everything here is public. The JS bundle, the anon key, every         │
│  fetch() call, every check in AccessGate.tsx. Assume an attacker has   │
│  read your source and can replay any request with curl.               │
│  → Enforces NOTHING. It is a user-experience layer only.              │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
┌─ Boundary 2: CORS ─────────▼──────────────────────────────────────────┐
│  ALLOWED_ORIGINS in server.js:97. Stops evil.com's *JavaScript* from  │
│  reading your API using a logged-in visitor's browser.                │
│  → Enforces NOTHING against curl/Postman/scripts. CORS is a browser   │
│    politeness rule, not an authentication mechanism.                  │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
┌─ Boundary 3: THE BACKEND ──▼──────────────────────────────────────────┐
│  getUserFromAuthHeader() in payments.js:83 — verifies a Supabase JWT. │
│  → THIS is the only real authentication in the system. A route that   │
│    does not call it is a route with no security at all.               │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
┌─ Boundary 4: ROW LEVEL SECURITY ──▼───────────────────────────────────┐
│  Postgres policies (0016_identity.sql:125-149). The last line of      │
│  defense — it applies even if the anon key leaks or a backend route   │
│  has a bug, because it is enforced by the database itself.            │
│  → Only protects tables where it is ENABLED, and views can bypass it. │
└───────────────────────────────────────────────────────────────────────┘
```

### The single most important thing to internalize

**`VITE_SUPABASE_ANON_KEY` is not a secret.** It ships inside the JavaScript bundle of
both frontends. Anyone can open DevTools, copy it, and make direct PostgREST calls to
`https://dbotrrrbqwgzccuiylef.supabase.co/rest/v1/<table>` — completely bypassing your
backend, your CORS policy, and your paywall.

This is *by design* and it is safe **only** because RLS is supposed to stop them. Which
means: **every table reachable with the anon key must have RLS enabled and a correct
policy, or it is world-readable.** See Finding 2 — this is where the real hole is.

The genuinely secret values, which must never reach a browser:

| Secret | Why it's fatal if leaked |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses **all** RLS. Total database compromise. |
| `DATABASE_URL` | Direct DB owner connection. Same, plus schema destruction. |
| `STRIPE_SECRET_KEY` | Issue refunds, read all customer PII, create charges. |
| `STRIPE_WEBHOOK_SECRET` | Forge `checkout.session.completed` → free access for anyone. |
| `ANTHROPIC_API_KEY` | Unbounded spend on your account. |

**Good news, verified:** none of these are in git. A full scan of all 7 commits
(`git grep` for `sk_test_`/`sk_live_`/`whsec_`/`sk-ant-`/`service_role`/JWT prefixes
across `git rev-list --all`) returned **zero hits**. Only `.env.example` files were ever
committed.

> **CLAUDE.md correction:** the "Known gaps" section and the deploy notes claim keys
> "were exposed in git history" and demand rotation before launch. **That is not true of
> this repository** — `.gitignore` covered `.env` from the start. Rotating keys is still
> good hygiene before handling real money, but it is *not* the emergency that CLAUDE.md
> describes, and it should not block deployment.

---

## Part 2 — Audit findings (verified, worst first)

### 🔴 Finding 1 — `/api/ai/chat` is completely unauthenticated

**[backend/server.js:440](backend/server.js#L440)** — the route never calls
`getUserFromAuthHeader()`. Anyone on the internet can POST to it and spend your Anthropic
balance. The 5-turn loop cap limits one request; nothing limits the number of requests.

**Verified in production:**

```bash
$ curl -s -X POST https://explore-vieques-production.up.railway.app/api/ai/chat \
    -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"hi"}]}'

{"error":"400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",
\"message\":\"Your credit balance is too low to access the Anthropic API...\"},
\"request_id\":\"req_011CdJH78KoeRZQxt6NYYL9P\"}"}
```

No `Authorization` header — and the request went **all the way to Anthropic**. It only
failed because the account is out of credit. With a funded account, that is an open,
unmetered LLM proxy pointed at your credit card.

Three separate problems in one response:
1. **No auth** — free access to a paid resource.
2. **No rate limiting** — a single loop can issue thousands of requests.
3. **Upstream error leaked verbatim** — the caller learns your provider, your billing
   state, and an internal `request_id`.

Also note the credit system is **decorative**: `PLANS.credits` grants 20 credits, but
nothing in `server.js` ever writes a negative `credit_transactions` row. Credits are sold
and never spent.

> ⚠️ **This also blocks your runbook.** CLAUDE.md Step 1.6 says to test AI chat and watch
> pins drop. That test will fail right now regardless of your code — the Anthropic account
> needs funding first.

---

### 🔴 Finding 2 — `credit_balances` bypasses RLS; every user's balance is world-readable

The Supabase security linter flags this as **ERROR**:

> View `public.credit_balances` is defined with the SECURITY DEFINER property

**Why this happens.** `0016_identity.sql:71` creates a plain view over
`credit_transactions`. In Postgres, a view executes with the **view owner's** permissions
unless you say otherwise — so the RLS policy `"own credits read"` on the underlying table
**does not apply when reading through the view**. The comment at line 149 ("The browser
can never fake a purchase or grant itself credits") is true for *writes* but wrong for
*reads through this view*.

**Verified — `anon` holds SELECT on it:**

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='credit_balances';
-- → anon: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
```

So with only the public anon key from your JS bundle:

```
GET https://dbotrrrbqwgzccuiylef.supabase.co/rest/v1/credit_balances?select=*
    apikey: <anon key from the bundle>
```

…returns **every user's `user_id` and credit balance**. That is a customer-data leak, and
it needs no login at all.

**Fix** (Postgres 15+, and you're on 17.6):

```sql
ALTER VIEW public.credit_balances SET (security_invoker = on);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_balances FROM anon, authenticated;
REVOKE SELECT ON public.credit_balances FROM anon;
```

`security_invoker = on` makes the view run as the *querying* user, so RLS on
`credit_transactions` finally applies through it.

---

### 🟠 Finding 3 — The paywall is cosmetic; all paid content is public

`AccessGate.tsx` gates the **UI**, not the **data**. Every content route in `server.js`
(lines 163–605) is unauthenticated by design ("No auth needed — the paywall is enforced in
the map app's AccessGate"). But AccessGate runs in the browser, which the user controls.

**Verified:**

```bash
$ curl -s https://explore-vieques-production.up.railway.app/api/beaches | jq length
18
```

All 18 beaches, plus restaurants, transport, snorkel spots and PostGIS zones — the entire
product you charge $9 for — served to anyone who types the URL. Additionally, the linter
reports **18 content tables with RLS disabled entirely**, so they're equally readable
straight from PostgREST with the anon key.

This is a **business** decision as much as a security one. Pick one deliberately:

- **(a) Content is marketing.** Fine — leave it open, and accept that the map data is
  public. Then the paywall's real value is the AI assistant, which makes Finding 1 the
  urgent one.
- **(b) Content is the product.** Then content routes need `requireEntitlement` (Part 3),
  and content tables need RLS enabled with a policy keyed to an active subscription.

Right now you are in state (a) while believing you are in state (b). That gap is the
actual bug.

---

### 🟠 Finding 4 — Webhook idempotency is a race, not a guarantee

**[backend/payments.js:259](backend/payments.js#L259)** guards double-fulfillment with
`SELECT 1 ... WHERE stripe_session_id = $1`, then inserts. Classic **check-then-act**: two
concurrent deliveries of the same event can both pass the SELECT before either INSERTs.

**Verified — nothing at the database level prevents it:**

```sql
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'public.subscriptions'::regclass;
-- → subscriptions_pkey (p), plan check, status check, user_id fkey
-- → NO unique constraint on stripe_session_id
```

Stripe retries on timeout, and your AI route can make the process slow enough to time out.
The result is a duplicate grant, or double credits on a credit pack.

**Fix** — let the database enforce it:

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_stripe_session_uniq
  ON public.subscriptions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
```

Then change the INSERT to `... ON CONFLICT (stripe_session_id) DO NOTHING` and drop the
SELECT entirely. Correctness now comes from Postgres, not from timing.

---

### 🟡 Finding 5 — Internal errors leak to clients

Every route ends with `res.status(500).json({ error: e.message })`. A Postgres error
message can carry table names, column names, constraint names, and fragments of SQL — a
free schema map for anyone probing you. Finding 1 shows the same pattern leaking your
Anthropic billing state.

**Fix:** log the detail server-side with a request id, return an opaque message. See the
`errorHandler` in Part 3.

---

### 🟡 Finding 6 — No rate limiting anywhere

There is no limiter on any route. The expensive ones are `/api/ai/chat` (Anthropic spend),
`/api/directions` (proxies the free public OSRM — you can get your server IP banned), and
`/api/checkout` (Stripe customer-object spam). `/api/entitlement` also hits Supabase Auth
over the network on **every single call**, which is both a cost and a latency issue.

---

### 🟡 Finding 7 — `sendAiChat` and `startCheckout` never send the token

**[frontend/src/lib/api.ts:148](frontend/src/lib/api.ts#L148)** and
**[:245](frontend/src/lib/api.ts#L245)** post without an `Authorization` header. So the
moment you fix Finding 1, AI chat breaks from the map app. `startCheckout` is already
dead code from the map app for this reason — it can only ever 401. Fix the client at the
same time as the server (helper provided in Part 3).

---

### 🟢 Finding 8 — Lower-severity items

| Item | Where | Note |
|---|---|---|
| CORS allows no-Origin requests | server.js:113 | Intentional (curl/health checks). Harmless **once routes authenticate** — but it means CORS protects nothing on unauthenticated routes. |
| `rejectUnauthorized: false` | server.js:66 | Documented Supabase pooler requirement. Accept it, but it does mean the DB connection isn't certificate-verified. |
| Unbounded `messages` array | server.js:442 | A caller can post a huge transcript, or forge `assistant` turns to manipulate the model. Cap length and count. |
| 12 functions with mutable `search_path` | linter WARN | Low risk here (no untrusted role can create shadowing objects), but trivially fixed with `SET search_path = ''`. |
| `handle_new_user()` callable via RPC | linter WARN | `SECURITY DEFINER` and exposed to `anon`. It only inserts a profile for `NEW.id`, so calling it standalone errors — but revoke EXECUTE anyway. |
| Leaked-password protection off | linter WARN | One toggle in Supabase Auth settings; checks signups against HaveIBeenPwned. |
| `pg_net` in `public` schema | linter WARN | Move to an `extensions` schema. |
| No `helmet`, no HSTS | server.js | Cheap to add; low impact for a JSON API. |

---

## Part 3 — The hardening playbook

Ordered by value-per-effort. Steps 1–3 close every 🔴 and 🟠 finding.

### Step 1 — One middleware file (`backend/middleware.js`)

This is the single highest-leverage change in the document: it makes "who are you" and
"have you paid" composable, so protecting a route becomes a one-word edit.

```js
// ============================================================================
//  middleware.js — auth, entitlement, rate limiting, error handling
// ============================================================================
//  Boundary 3 from SECURITY.md lives here. A route that does not use
//  requireAuth has NO authentication — CORS does not count.
// ============================================================================
import crypto from 'node:crypto'
import { getUserFromAuthHeader } from './payments.js'

// --- Request id -------------------------------------------------------------
// Stamped on every request so a user-visible error code can be grepped out of
// the logs. Returned to the client; the actual error detail never is.
export function requestId(req, res, next) {
  req.id = crypto.randomUUID().slice(0, 8)
  res.setHeader('X-Request-Id', req.id)
  next()
}

// --- Authentication ---------------------------------------------------------
// Verifies the Supabase JWT. Caches the result for 60s: getUser() is a network
// call to Supabase, and AccessGate hits /api/entitlement on every page load.
const userCache = new Map() // token -> { user, expires }

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()

  const hit = userCache.get(token)
  if (hit && hit.expires > Date.now()) {
    req.user = hit.user
    return next()
  }

  const user = await getUserFromAuthHeader(req)
  if (user) {
    userCache.set(token, { user, expires: Date.now() + 60_000 })
    req.user = user
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' })
  next()
}

// --- Entitlement ------------------------------------------------------------
// Server-side paywall. This is the check AccessGate.tsx *pretends* to be:
// AccessGate hides the UI, this actually withholds the data.
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
    } catch (e) { next(e) }
  }
}

// --- Rate limiting ----------------------------------------------------------
// In-memory fixed window. Fine for ONE Railway instance; move to Postgres or
// Redis the moment you scale to two (each would keep its own counter).
export function rateLimit({ windowMs = 60_000, max = 30, key } = {}) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  }, windowMs).unref()

  return (req, res, next) => {
    // Prefer user id over IP: mobile carriers NAT many users behind one address.
    const id = key ? key(req) : (req.user?.id || req.ip)
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

// --- Error handling ---------------------------------------------------------
// Terminal handler. Full detail to the logs, opaque message to the client.
// Must be registered LAST, after every route.
export function errorHandler(err, req, res, _next) {
  console.error(JSON.stringify({
    level: 'error', reqId: req.id, method: req.method, path: req.path,
    userId: req.user?.id ?? null, message: err.message, stack: err.stack,
  }))
  if (res.headersSent) return
  res.status(err.status || 500).json({
    error: 'Something went wrong on our end.',
    requestId: req.id,   // the user can quote this; it reveals nothing
  })
}
```

Wire it up in `server.js`:

```js
import { requestId, authenticate, requireAuth, requireEntitlement,
         rateLimit, errorHandler } from './middleware.js'

// after app.use(express.json()) — but note the webhook stays above express.json()
app.use(requestId)
app.use(authenticate)          // populates req.user when a valid token is present

// Finding 1 + 6: authenticate, gate on payment, and cap the spend.
app.post('/api/ai/chat',
  requireAuth,
  requireEntitlement(pool),
  rateLimit({ windowMs: 60_000, max: 10 }),
  aiChatHandler)

// Finding 6: OSRM is a free public service — don't get your IP banned.
app.post('/api/directions', rateLimit({ windowMs: 60_000, max: 20 }), directionsHandler)
app.post('/api/checkout',   rateLimit({ windowMs: 60_000, max: 5 }),
                            requireAuth, (req, res) => createCheckoutSession(pool, req, res))

app.use(errorHandler)          // LAST
```

For Finding 3(b), protecting content is then one line per route:

```js
app.get('/api/beaches', requireAuth, requireEntitlement(pool), beachesHandler)
```

Also cap the transcript (Finding 8) at the top of the AI handler:

```js
const MAX_MESSAGES = 20, MAX_CHARS = 4000
const userMessages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
  .slice(-MAX_MESSAGES)
  .filter(m => m?.role === 'user' || m?.role === 'assistant')
  .map(m => ({ role: m.role, content: String(m.content ?? '').slice(0, MAX_CHARS) }))
```

### Step 2 — The database migration (`db/migrations/0018_security_hardening.sql`)

```sql
-- ============================================================================
-- 0018_security_hardening.sql
-- Closes SECURITY.md Findings 2, 4 and the linter WARNs. Idempotent.
-- ============================================================================

-- Finding 2: make the view respect the querying user's RLS. --------------
ALTER VIEW public.credit_balances SET (security_invoker = on);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.credit_balances FROM anon, authenticated;
REVOKE SELECT ON public.credit_balances FROM anon;

-- Finding 4: idempotency enforced by the database, not by timing. --------
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_session_uniq
  ON public.subscriptions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Ledger stays append-only: no UPDATE/DELETE, for anyone, ever. ----------
REVOKE UPDATE, DELETE, TRUNCATE ON public.credit_transactions FROM anon, authenticated;

-- Linter WARN: handle_new_user is a trigger function, not an API. --------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- Linter WARN: pin search_path on the helper functions. ------------------
ALTER FUNCTION public.touch_updated_at()  SET search_path = '';
ALTER FUNCTION public.set_updated_at()    SET search_path = '';
```

Apply with the Supabase MCP `apply_migration` tool (it records the migration), or paste
into the Supabase SQL Editor. **Re-run the linter afterward** — see Part 4.

For Finding 3(b), content-table RLS looks like this:

```sql
ALTER TABLE public.beaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paid users read beaches" ON public.beaches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.subscriptions s
            WHERE s.user_id = auth.uid() AND s.status = 'active'
              AND (s.expires_at IS NULL OR s.expires_at > now()))
  );
```

The backend's `pg` pool connects as the owner and **bypasses RLS**, so your API keeps
working unchanged — this only closes the direct-PostgREST path. Repeat per content table.

### Step 3 — Fix the frontend token plumbing (Finding 7)

Add to `frontend/src/lib/api.ts`:

```ts
import { getSession } from './supabase'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
```

Then in `sendAiChat` and `startCheckout`:

```ts
headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
```

### Step 4 — Cheap wins

```bash
cd backend && npm install helmet
```

```js
import helmet from 'helmet'
app.use(helmet())                      // sensible security headers
app.use(express.json({ limit: '100kb' }))  // explicit body cap
```

And in the Supabase dashboard: **Authentication → Policies → enable leaked-password
protection**.

---

## Part 4 — Seeing inside the system

Security you can't observe is security you're guessing at. Same for data bugs. Here is the
tooling, cheapest first.

### 4.1 Tools you already have and aren't using

**The Supabase linter is the highest-value tool in this list** — it found Finding 2 for
free. It runs against your live schema and catches exactly the class of mistake that is
invisible in code review (a view silently bypassing RLS).

Via the Supabase MCP integration already connected to this project:

```
get_advisors(project_id="dbotrrrbqwgzccuiylef", type="security")
get_advisors(project_id="dbotrrrbqwgzccuiylef", type="performance")
get_logs(project_id="dbotrrrbqwgzccuiylef", service="postgres")   # also: auth, api
```

**Run the security advisor after every migration.** Add it to your definition of done.

Other things already available: **Railway logs** (`railway logs`, deploy + runtime),
**Stripe Dashboard → Webhooks** (per-event delivery, response codes, replay button — this
is your payment debugger), and the **Supabase SQL Editor**.

### 4.2 Structured logging — the prerequisite for everything else

`console.log` prose isn't searchable. One-line JSON is. With `requestId` from Part 3:

```js
// backend/log.js
export const log = (level, msg, meta = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }))
```

Log the events that matter — money, access, and spend:

```js
log('info', 'entitlement_check', { reqId: req.id, userId: user.id, hasAccess })
log('warn', 'webhook_signature_failed', { reqId: req.id, ip: req.ip })
log('info', 'fulfilled', { reqId: req.id, userId, plan: planKey, session: session.id })
log('info', 'ai_chat', { reqId: req.id, userId, turns: i + 1, pins: pins.length })
```

Now `railway logs | grep webhook_signature_failed` is a real answer to "is someone
attacking my webhook?"

### 4.3 A CLI for operations (`backend/cli.js`)

The tool you'll reach for most. It runs against the same pool as the server, so it sees
exactly what the API sees — no RLS surprises, no dashboard clicking.

```js
#!/usr/bin/env node
// ============================================================================
//  cli.js — operator console.  Usage: node cli.js <command> [args]
//  Runs as the DB owner (bypasses RLS) — this is an OPERATOR tool. Never
//  expose it over HTTP.
// ============================================================================
import './env.js'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: '-c search_path=public',   // same pooler gotcha as server.js
})

const q = (sql, params = []) => pool.query(sql, params).then(r => r.rows)
const table = (rows) => rows.length ? console.table(rows) : console.log('(no rows)')

const commands = {
  // --- Who is this user and what do they actually have? ------------------
  async user(email) {
    const [u] = await q(`SELECT id, email, created_at, last_sign_in_at,
                                email_confirmed_at
                         FROM auth.users WHERE email = $1`, [email])
    if (!u) return console.log(`No user: ${email}`)
    console.log('\nUSER');          table([u])
    console.log('SUBSCRIPTIONS');   table(await q(
      `SELECT plan, status, expires_at,
              (status='active' AND (expires_at IS NULL OR expires_at > now())) AS grants_access,
              stripe_session_id, created_at
       FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC`, [u.id]))
    console.log('CREDIT LEDGER');   table(await q(
      `SELECT amount, reason, ref, created_at FROM credit_transactions
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [u.id]))
  },

  // --- Answer "why can't my customer get in?" in one command -------------
  async whoami(email) {
    const [r] = await q(
      `SELECT u.email,
              EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=u.id
                     AND s.status='active'
                     AND (s.expires_at IS NULL OR s.expires_at > now())) AS has_access,
              COALESCE((SELECT SUM(amount) FROM credit_transactions c
                        WHERE c.user_id=u.id), 0) AS credits
       FROM auth.users u WHERE u.email=$1`, [email])
    table([r ?? { email, has_access: 'NO SUCH USER' }])
  },

  // --- Data integrity sweep: the checks that catch silent corruption -----
  async doctor() {
    const checks = [
      ['orphaned subscriptions (user deleted)',
       `SELECT COUNT(*)::int n FROM subscriptions s
        LEFT JOIN auth.users u ON u.id=s.user_id WHERE u.id IS NULL`],
      ['DUPLICATE fulfillment (Finding 4 firing)',
       `SELECT COUNT(*)::int n FROM (SELECT stripe_session_id FROM subscriptions
        WHERE stripe_session_id IS NOT NULL
        GROUP BY 1 HAVING COUNT(*)>1) d`],
      ['paid users with no profile row (trigger failed)',
       `SELECT COUNT(*)::int n FROM subscriptions s
        LEFT JOIN profiles p ON p.id=s.user_id WHERE p.id IS NULL`],
      ['active subs already past expiry (sweeper needed)',
       `SELECT COUNT(*)::int n FROM subscriptions
        WHERE status='active' AND expires_at < now()`],
      ['negative credit balances (overspend)',
       `SELECT COUNT(*)::int n FROM credit_balances WHERE balance < 0`],
      ['listings with no coordinates (invisible on map)',
       `SELECT COUNT(*)::int n FROM beaches
        WHERE is_active AND (latitude IS NULL OR longitude IS NULL)`],
      ['coordinates outside Vieques bbox (bad import)',
       `SELECT COUNT(*)::int n FROM beaches WHERE latitude IS NOT NULL
        AND (latitude NOT BETWEEN 18.0 AND 18.3
          OR longitude NOT BETWEEN -65.6 AND -65.2)`],
      ['content tables still empty (CLAUDE.md known gap)',
       `SELECT ((SELECT COUNT(*) FROM activity_listings)
              + (SELECT COUNT(*) FROM service_listings) = 0)::int AS n`],
    ]
    let bad = 0
    for (const [label, sql] of checks) {
      try {
        const [{ n }] = await q(sql)
        if (n > 0) bad++
        console.log(`${n > 0 ? '❌' : '✅'} ${label}: ${n}`)
      } catch (e) { console.log(`⚠️  ${label}: check failed — ${e.message}`) }
    }
    console.log(bad ? `\n${bad} check(s) need attention.` : '\nAll checks clean.')
    process.exitCode = bad ? 1 : 0
  },

  // --- Manual grant. Logged as a real row so it is auditable. ------------
  async grant(email, plan = 'traveler', days = '30') {
    const [u] = await q('SELECT id FROM auth.users WHERE email=$1', [email])
    if (!u) return console.log(`No user: ${email}`)
    await q(`INSERT INTO subscriptions (user_id, plan, status, expires_at, stripe_session_id)
             VALUES ($1,$2,'active', now() + ($3||' days')::interval, $4)`,
            [u.id, plan, days, `manual_${Date.now()}`])
    console.log(`Granted ${plan} to ${email} for ${days} days.`)
  },

  // --- Expire stale rows. Run nightly. ----------------------------------
  async sweep() {
    const r = await pool.query(
      `UPDATE subscriptions SET status='expired'
       WHERE status='active' AND expires_at < now()`)
    console.log(`Expired ${r.rowCount} subscription(s).`)
  },

  // --- Revenue at a glance ----------------------------------------------
  async revenue() {
    table(await q(
      `SELECT plan, status, COUNT(*)::int AS n,
              MIN(created_at)::date AS first, MAX(created_at)::date AS latest
       FROM subscriptions GROUP BY plan, status ORDER BY n DESC`))
  },
}

const [cmd, ...args] = process.argv.slice(2)
if (!commands[cmd]) {
  console.log(`Commands:
  user <email>                  full picture: account, subs, credit ledger
  whoami <email>                one-line "can they get in?"
  doctor                        data integrity sweep (exit 1 if problems)
  grant <email> [plan] [days]   manually grant access
  sweep                         mark past-expiry subscriptions expired
  revenue                       subscription counts by plan/status`)
  process.exit(1)
}
await commands[cmd](...args)
await pool.end()
```

Add to `backend/package.json`:

```json
"scripts": {
  "start":  "node server.js",
  "dev":    "node --watch server.js",
  "cli":    "node cli.js",
  "doctor": "node cli.js doctor"
}
```

Then the question "why is my customer locked out?" takes five seconds:

```bash
npm run cli -- user giancarlo@bravosboyz.com
npm run doctor
```

`doctor` exits non-zero on problems, so it drops straight into CI or a cron job.

### 4.4 An admin page — and why to build it *last*

An admin UI is the most fun and the least urgent. The CLI answers the same questions today
with zero attack surface. An admin page is worth building when **someone who isn't you**
needs those answers.

If you build one, the security design matters more than the UI:

1. **Never a separate password.** Reuse Supabase Auth; add an `admins` table
   (`user_id uuid PRIMARY KEY REFERENCES auth.users`) and a `requireAdmin` middleware that
   checks membership. Roles in JWT claims can go stale; a table lookup can't.
2. **Mount under `/api/admin/*`** with `requireAuth` + `requireAdmin` on the whole router,
   not per-route — so a forgotten route fails closed.
3. **Log every write** to an `admin_audit` table: who, what, when, target, old → new value.
4. **Read-heavy.** Support "look up a user", "expire a subscription", "grant a comp plan".
   Do *not* build arbitrary SQL execution behind a web login.

```js
export async function requireAdmin(req, res, next) {
  const { rows } = await req.app.locals.pool.query(
    'SELECT 1 FROM public.admins WHERE user_id = $1', [req.user.id])
  if (!rows.length) return res.status(404).end()   // 404, not 403: don't confirm it exists
  next()
}
```

### 4.5 Database interfaces — which to use when

| Tool | Best for | Watch out |
|---|---|---|
| **Supabase SQL Editor** | Quick queries, migrations, linter | Runs as owner — bypasses RLS, so it will **not** reproduce user-facing permission bugs |
| **`psql` via pooler** | Scripting, `pg_dump`, bulk fixes | Remember `-c search_path=public` (the CLI above does) |
| **TablePlus / DBeaver** | Visual browsing, schema exploration | Same owner-level caveat |
| **PostgREST + anon key** | **Verifying RLS actually works** | The *only* one that tests what a real attacker sees |

That last row is the important one. To reproduce a permission bug, query as the anon role
the way a browser would:

```bash
curl "https://dbotrrrbqwgzccuiylef.supabase.co/rest/v1/credit_balances?select=*" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

If that returns rows for users other than yourself, RLS is broken — regardless of what the
SQL Editor shows you. **This is how you'd have caught Finding 2 by hand.**

### 4.6 A smoke-test script (`backend/smoke.sh`)

Turns the manual curl checks in CLAUDE.md into something repeatable after every deploy.

```bash
#!/usr/bin/env bash
# Usage: ./smoke.sh [base_url]
set -u
BASE="${1:-https://explore-vieques-production.up.railway.app}"
pass=0; fail=0

check() { # check <name> <expected_code> <curl args...>
  local name="$1" want="$2"; shift 2
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@")
  if [ "$got" = "$want" ]; then echo "✅ $name ($got)"; pass=$((pass+1))
  else echo "❌ $name — wanted $want, got $got"; fail=$((fail+1)); fi
}

echo "Smoke testing $BASE"
check "health"                200 "$BASE/api/health"
check "beaches read"          200 "$BASE/api/beaches"
check "entitlement w/o token" 401 "$BASE/api/entitlement"
check "entitlement forged"    401 "$BASE/api/entitlement" -H "Authorization: Bearer forged.jwt.here"
check "checkout w/o token"    401 -X POST "$BASE/api/checkout" \
      -H 'Content-Type: application/json' -d '{"plan":"traveler"}'
check "webhook unsigned"      400 -X POST "$BASE/api/stripe/webhook" \
      -H 'Content-Type: application/json' -d '{}'
# After Finding 1 is fixed, this must be 401 — it is currently 500/200:
check "ai chat w/o token"     401 -X POST "$BASE/api/ai/chat" \
      -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'

echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
```

`chmod +x backend/smoke.sh`. The last check **fails today** — that's the point. It should
go green when you fix Finding 1, and it will catch any regression afterward.

---

## Part 5 — Routines

**After every schema change**
1. `get_advisors(type="security")` — must be clean of ERRORs.
2. `npm run doctor` — must exit 0.
3. If RLS changed, verify with the anon key via PostgREST (§4.5), not the SQL Editor.

**After every deploy**
1. `./backend/smoke.sh` — all green.
2. `railway logs` — no `error` lines from boot.

**Weekly**
1. `npm run cli -- revenue` — do the numbers match Stripe?
2. `npm run cli -- sweep` — expire stale subscriptions (better: nightly cron).
3. Skim Stripe → Webhooks for non-2xx deliveries.

**Before accepting real money (`sk_live`)**
- [ ] Finding 1 fixed — AI route authenticated, entitled, rate-limited
- [ ] Finding 2 fixed — `credit_balances` linter ERROR gone
- [ ] Finding 3 decided — content public *on purpose*, or gated
- [ ] Finding 4 fixed — unique index on `stripe_session_id`
- [ ] Finding 5 fixed — no `e.message` reaching clients
- [ ] Anthropic account funded (blocks the CLAUDE.md Step 1 test)
- [ ] Leaked-password protection enabled
- [ ] Keys rotated (hygiene — **not** an emergency; nothing leaked to git)
- [ ] Credits either spent on AI queries, or removed from the pricing page

---

## Appendix — Priority summary

| # | Finding | Severity | Effort | Fix |
|---|---|---|---|---|
| 1 | `/api/ai/chat` open to the world | 🔴 | S | Part 3 Step 1 |
| 2 | `credit_balances` bypasses RLS | 🔴 | XS | Part 3 Step 2 |
| 3 | Paywall is client-side only | 🟠 | M | Decide, then Step 1/2 |
| 4 | Webhook idempotency race | 🟠 | XS | Part 3 Step 2 |
| 5 | Internal errors leak | 🟡 | XS | `errorHandler` |
| 6 | No rate limiting | 🟡 | S | `rateLimit` |
| 7 | Client omits auth token | 🟡 | XS | Part 3 Step 3 |
| 8 | Assorted linter WARNs | 🟢 | S | Part 3 Step 2/4 |

**If you do only two things: Finding 1 and Finding 2.** One protects your wallet, the
other protects your customers' data. Together they are under an hour of work.
