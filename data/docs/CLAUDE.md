# Explore Vieques — Project Guide

AI-powered, map-based travel discovery app for Vieques, Puerto Rico. Users sign up,
pay for a plan, and get an interactive island map (beaches, restaurants, activities,
transport, essentials, snorkeling) with an AI assistant that drops answers as map pins.

Production domain: **explorevieques.org** (live site is served from `www.`).

---

## Architecture — three apps + one database

| App | Folder | Dev port | Prod (intended) | Purpose |
|-----|--------|----------|-----------------|---------|
| Landing | `landing/` | **5174** | explorevieques.org (Vercel) | Marketing, sign-up, login, pricing, checkout, success, account |
| Map app | `frontend/` | **5173** | app.explorevieques.org | The delivered product — the interactive map |
| Backend API | `backend/` | **3001** | api.explorevieques.org | Gatekeeper: the only thing that talks to Postgres, Stripe, and Claude |
| Database | — | — | Supabase (Postgres + PostGIS + pgvector) | Map content + identity/auth + payments |

**Gatekeeper rule:** the browser never talks to Postgres, Stripe, or Claude directly.
All of that goes through `backend/`. Row Level Security protects identity/payment tables.

> 📄 **See [SECURITY.md](SECURITY.md)** for the full expansion of this rule — the four
> trust boundaries, a verified audit of where they currently leak, the hardening
> playbook, and the operator tooling (`cli.js`, `smoke.sh`, Supabase linter) for
> debugging data issues. **Two open 🔴 issues** as of 2026-07-22: `/api/ai/chat` is
> unauthenticated (anyone can spend your Anthropic balance) and the `credit_balances`
> view bypasses RLS (every user's balance is world-readable with the public anon key).

### Tech
- **Landing:** React + Vite (JS), plain CSS (`landing/public/styles.css`, design tokens as CSS vars), react-router-dom, Supabase Auth.
- **Map app:** React + Vite + TypeScript, Tailwind, MapLibre GL.
- **Backend:** Node/Express (ESM), `pg`, Stripe, Anthropic SDK, OSRM+PostGIS for directions.
- **Auth:** Supabase Auth. A DB trigger auto-creates a `profiles` row on signup.
- **Payments:** Stripe (sandbox). Access is granted ONLY by the webhook writing a
  `subscriptions` row — see "Known gaps".

---

## Local development

Run all three in separate terminals:

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm start

# Terminal 2 — landing (port 5174, strictPort)
cd landing && npm run dev

# Terminal 3 — map app (port 5173)
cd frontend && npm run dev
```

Each folder has its own `.env` (commit only `.env.example`). Key vars:
- `backend/.env`: `DATABASE_URL` (Supabase pooler) or `DB_*` (local), `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LANDING_URL`, `APP_URL`, `NODE_ENV`
- `landing/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE` (→ backend), `VITE_APP_URL` (→ map app)
- `frontend/.env`: `VITE_API_BASE` (→ backend), `VITE_LANDING_URL` (→ landing), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPTILER_KEY`

---

## Conventions & gotchas (learned the hard way — don't regress these)

### Cross-origin session hand-off (landing ↔ map app)
The landing (5174 / explorevieques.org) and the map app (5173 / app subdomain) are
**different origins**, so a Supabase session in `localStorage` on one is **invisible** to
the other. Do NOT assume the session carries over.

- The landing hands the session to the map app via the **URL hash**:
  `landing/src/lib/mapApp.js` → `mapUrlWithSession(session)` builds
  `${APP_URL}/#access_token=...&refresh_token=...`. Use `launchMapApp()` for every
  "open the map" path (login, NavBar Launch App, Success page, profile menu).
- The map app adopts it: `frontend/src/components/AccessGate.tsx` reads the hash, calls
  `supabase.auth.setSession()`, then strips the hash from the URL.
- The map app's Supabase client sets `detectSessionInUrl: false` so it doesn't fight the
  custom hash (`frontend/src/lib/supabase.ts`).
- Tokens live only in the hash (never sent to a server) and are wiped immediately.

### Supabase transaction pooler needs an explicit search_path
The backend connects via `DATABASE_URL` (the pooler at `...pooler.supabase.com:6543`).
The transaction pooler starts sessions with an **empty search_path**, so unqualified
names like `FROM beaches` fail intermittently with `relation "beaches" does not exist`.
Fixed with `options: '-c search_path=public'` in the `pg.Pool` config in
`backend/server.js`. Keep it.

### CORS / dev ports
- `backend/server.js` allows any `http://localhost:*` origin **in dev only**
  (`NODE_ENV !== 'production'`), because Vite bumps to 5175/5176… when a port is taken.
- The landing is pinned with `strictPort: true` (`landing/vite.config.js`) so it owns
  5174 or fails loudly instead of silently drifting and breaking the CORS allowlist.

### Data lives in Supabase now
All map content (beaches, `*_listings`, categories, snorkel, transport) was migrated
from local Postgres into Supabase (2026-07-21). The initial Supabase push had missed it.
Migration used `pg_dump --data-only` + `session_replication_role = replica` + `TRUNCATE …
RESTART IDENTITY`, touching **only content tables** — identity/payment tables
(`profiles`, `subscriptions`, `credit_*`, `customers`) were deliberately left alone.
Note: `activity_listings` and `service_listings` are empty (no data authored yet).

---

## Deployment — production is only partially live

### Deploy progress log (updated 2026-07-22)

**THE BACKEND IS LIVE AND VERIFIED IN PRODUCTION** on the generated Railway domain:

```
https://explore-vieques-production.up.railway.app
```

Backend → Railway — done:
- ✅ Railway project created; **GitHub Repository** service node is live.
- ✅ **Root Directory = `backend`** set (fixed the "no buildable app at repo root" error).
- ✅ Build succeeds (Nixpacks → `npm start`); health check green.
- ✅ **Environment variables set.** The earlier boot crash (`Invalid supabaseUrl` at
  `payments.js:15`) was caused by `0 Variables`. Paste-ready block lives in
  **`backend/railway.env`** (gitignored) → Railway → Variables → Raw Editor.
- ✅ **Stripe webhook destination registered** against the Railway URL (see below).
- ✅ **Frontends repointed** — `frontend/.env` and `landing/.env` now have
  `VITE_API_BASE=https://explore-vieques-production.up.railway.app`.
- ⏳ **Custom domain** `api.explorevieques.org` — deliberately deferred (needs the paid
  Railway plan; the generated domain is fully functional for testing).
- ⏳ **Map app not deployed** to Vercel yet.

#### Verified in production on 2026-07-22 (live curl against Railway)

| What it proves | Endpoint | Result |
|---|---|---|
| Process alive + DB reachable | `GET /api/health` (`SELECT 1`) | ✅ `{"ok":true}` in ~0.8s |
| Supabase content reads work | `GET /api/beaches` | ✅ real rows |
| PostGIS reads work | `GET /api/snorkel-spots` | ✅ real rows w/ lat-lng |
| Auth guard — no token | `GET /api/entitlement` | ✅ `401 "Not signed in"` |
| Auth guard — forged token | `GET /api/entitlement` | ✅ `401 "Not signed in"` |
| Checkout guard | `POST /api/checkout` | ✅ `401 "Please sign in..."` |
| Webhook signature armed | `POST /api/stripe/webhook` unsigned | ✅ `400 no stripe-signature` |

Two important things this confirmed:
1. **The `search_path=public` pooler fix works in production.** Those queries use
   unqualified table names; without it they'd intermittently 500.
2. **The gatekeeper holds.** No unauthenticated or forged request can read entitlement,
   start a checkout, or forge a `checkout.session.completed` to grant itself access.

Diagrams for the topology + the Railway create-menu decisions:
`railway-graph.mmd`, `railway-create-menu.mmd` (repo root).

**Current reality:** the **landing** is deployed (www.explorevieques.org → Vercel,
`76.76.21.21`) but its Vercel env still points at localhost. The **backend is live on the
generated Railway domain**. The **map app is NOT deployed**. Custom API/app subdomains
still do not resolve:
- `api.explorevieques.org` → does not resolve (use the `*.up.railway.app` URL for now).
- `app.explorevieques.org` → does not resolve → "Launch App" falls back to
  `localhost:5173`, which an HTTPS page blocks → `about:blank#blocked`.

**Note on Vercel access:** the backend and the map app need to be deployed and given
domains. The `eplorevieques` Vercel team (`team_O7EVWUsq1avb3sTGCWNANT40`) has **SAML SSO
enabled**, so the Vercel MCP integration cannot enumerate its projects — deployment steps
below must be done in the Vercel dashboard / CLI while authenticated through SSO.

### Why the backend needs a separate host (not Vercel/Cloudflare)

The landing and map app are **static frontends** — Vite builds them to files, which is
exactly what Vercel/Cloudflare Pages serve. The backend is a **long-running Node/Express
process** and does not fit that model:

- It holds a **persistent Postgres pool** — wants a process that stays alive.
- `/api/ai/chat` runs a **Claude tool-use loop** that can take **10–60+ seconds** — this
  blows past Vercel's serverless timeout (10s Hobby / 60s Pro) and Cloudflare Workers.
- It receives **Stripe webhooks** at a stable, always-on URL.

So Express **can't** cleanly run on Vercel or Cloudflare Workers without a rewrite +
fighting timeouts. Run it on an always-on container host instead. The clean split:
**Vercel** = frontends, **Supabase** = DB/auth, **Cloudflare** = DNS, **Railway** = the API.

> Use an **always-on** plan. Avoid free tiers that sleep (e.g. Render free) — a cold start
> would slow every login's entitlement check and can make Stripe webhooks time out.

### Deploy the backend to Railway (fastest path, config included)

The repo ships `backend/railway.json` (Nixpacks build, `npm start`, health check on
`/api/health`) and `backend/.env.example` (the full var checklist). Steps:

1. ✅ **Create the service:** Railway → New Project → Deploy from GitHub → this repo →
   set **Root Directory = `backend`**. Nixpacks auto-runs `npm install` + `npm start`;
   `railway.json` supplies the start command + health check. `PORT` is injected by
   Railway (the server already reads `process.env.PORT`). — DONE.
2. ✅ **Set variables** (Railway → Variables → Raw Editor) — paste the whole of
   **`backend/railway.env`** (real values, `NODE_ENV=production`, NO `PORT`). Until these
   exist the server crashes on boot at `payments.js` (`Invalid supabaseUrl`). — DONE.
3. ⏳ **Custom domain:** Railway → service → Settings → Networking → add
   `api.explorevieques.org`. Railway gives you a CNAME target. **Deferred** — requires the
   paid plan; the generated domain works fine meanwhile.
4. ⏳ **DNS in Cloudflare:** add a **CNAME** `api` → the Railway target. Set **DNS-only
   (grey cloud)** to verify first; you can proxy (orange cloud) afterward.
5. ⏳ **Verify:** `curl https://api.explorevieques.org/api/health` → `{"ok":true}`.

> **Custom-domain gotcha:** Railway's "add domain" dialog forces you to type a **target
> port**. Enter **3001** (the fallback in `server.js`).

**Test-only variant (what we're doing now):** skip the custom domain — use the free
`*.up.railway.app` URL, set `NODE_ENV=production` + the vars, and point the frontends'
`VITE_API_BASE` at it. Promote to `api.explorevieques.org` once you pay for the plan.

> **Why local frontends can still call the production backend:** `ALLOWED_ORIGINS` in
> `server.js` **hardcodes** `http://localhost:5173` and `http://localhost:5174`
> regardless of `NODE_ENV`. So `npm run dev` frontends work against Railway. But the
> dev-only "any localhost port" escape hatch is OFF in production — if Vite bumps the map
> app to 5175+, CORS will reject it. Keep 5173 free.

### Stripe webhook wiring (learned 2026-07-22)

Registered destination: `explore-vieques-stripe` →
`https://explore-vieques-production.up.railway.app/api/stripe/webhook`

- **Payload style MUST be `Snapshot`, not `Thin`.** `handleWebhook()` reads
  `event.data.object` and needs the full object (`session.metadata.supabase_user_id`,
  `sub.status`, `sub.id`). A **Thin** payload omits the object, so `metadata` is
  `undefined` and fulfillment silently no-ops. A Thin destination was created by mistake
  and deleted.
- **One destination only.** Two destinations on the same URL = every event delivered
  twice.
- **Every new destination gets a NEW `whsec_` secret.** It must be copied into Railway →
  Variables → `STRIPE_WEBHOOK_SECRET` **and** into `backend/railway.env`, or every event
  fails signature verification with a `400`.
- Events that actually matter: `checkout.session.completed` (grants access),
  `customer.subscription.updated`, `customer.subscription.deleted`.

### Then deploy the frontends

6. **Map app** (`frontend/`) → Vercel → point `app.explorevieques.org` at it. Env:
   `VITE_API_BASE=https://api.explorevieques.org`,
   `VITE_LANDING_URL=https://explorevieques.org`, plus `VITE_SUPABASE_*`, `VITE_MAPTILER_KEY`.
7. **Landing** (Vercel, already deployed) → set
   `VITE_API_BASE=https://api.explorevieques.org` and
   `VITE_APP_URL=https://app.explorevieques.org`, then redeploy.

After this, the cross-origin session hand-off (above) already works for the
`explorevieques.org → app.explorevieques.org` origins — no code change needed.

> Rotate the Stripe/Anthropic/Supabase keys **before** deploying — they were exposed in
> git history, and you don't want compromised `sk_live` keys baked into production.

---

## NEXT STEPS — the deployment runbook from here

Ordered. Each step assumes the one before it passed.

### Step 1 — Browser smoke test of the money path ⬅️ **YOU ARE HERE**
The only part of the backend not yet verified. Everything else was proven by curl.

1. Restart both frontends so Vite re-reads `.env` (it only reads at boot):
   `cd landing && npm run dev` (5174) and `cd frontend && npm run dev` (5173).
2. Sign up / log in on the landing.
3. Buy the traveler plan → Stripe test card `4242 4242 4242 4242`, any future expiry,
   any CVC + ZIP.
4. **The make-or-break check:** Stripe Dashboard → `explore-vieques-stripe` destination →
   the `checkout.session.completed` event should show **200**.
   - `200` → webhook fired, signature matched, `subscriptions` row written. ✅
   - `400` → `STRIPE_WEBHOOK_SECRET` in **Railway** doesn't match the destination's
     signing secret. Editing `backend/railway.env` alone does nothing — the live value
     lives in the Railway Variables panel.
5. Success page → **Launch App** → map opens (AccessGate sees the subscription).
6. AI chat → "best snorkeling beaches" → pins drop. This is the real proof the Claude
   tool-use loop survives on an always-on host (it can run 10–60s).
   > ⚠️ **BLOCKED as of 2026-07-22:** the Anthropic account is out of credit. A live call
   > to `/api/ai/chat` returns `"Your credit balance is too low to access the Anthropic
   > API."` Fund the account at console.anthropic.com → Plans & Billing before this step
   > can pass — no code change will fix it.

### Step 2 — Pay for the Railway plan ($5 Hobby)
Not needed to test, needed to **stay up**. Two things it buys:
- **Always-on** — no sleep / execution-hour cap. Critical: a cold start slows every
  login's entitlement check and can time out Stripe webhooks.
- **Custom domains** — unlocks `api.explorevieques.org`.

### Step 3 — Promote to `api.explorevieques.org`
1. Railway → Settings → Networking → add the domain (**target port `3001`**).
2. Cloudflare → CNAME `api` → the Railway target, **DNS-only (grey cloud)** first.
3. `curl https://api.explorevieques.org/api/health` → `{"ok":true}`.
4. Update the Stripe destination URL to the custom domain. **The signing secret does not
   change** when you only edit the URL — but re-verify in the dashboard.
5. Repoint `VITE_API_BASE` in both frontends to the custom domain.

### Step 4 — Deploy the map app to Vercel
`frontend/` → new Vercel project → domain `app.explorevieques.org`. Env:
`VITE_API_BASE`, `VITE_LANDING_URL=https://explorevieques.org`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_MAPTILER_KEY`.
Then add `app.explorevieques.org` to `APP_URL` in Railway so CORS accepts it.

### Step 5 — Fix the landing's Vercel env
The deployed landing still points at localhost. Set `VITE_API_BASE` (Railway/custom
domain) + `VITE_APP_URL=https://app.explorevieques.org`, then **redeploy** — Vercel bakes
`VITE_*` in at build time, so a var change alone does nothing.

### Step 6 — Full production path test
On the real domains: sign up → pay → webhook 200 → Launch App crosses origins →
map loads → AI chat. The cross-origin session hand-off already works for these origins
(see "Conventions") — no code change needed.

---

## Known gaps / TODO

1. ~~**Rotate exposed keys** — keys were in git history.~~ **CORRECTED 2026-07-22: this
   was never true of this repo.** A scan of all 7 commits (`git grep` for `sk_test_`,
   `sk_live_`, `whsec_`, `sk-ant-`, `service_role`, JWT prefixes across
   `git rev-list --all`) found **zero** hits; only `.env.example` files were committed.
   Rotating before handling real money is still good hygiene, but it is **not** an
   emergency and must not block deployment. See [SECURITY.md](SECURITY.md) Part 1.
1b. **Open security issues** — see [SECURITY.md](SECURITY.md) Part 2. Two 🔴: the AI
   route is unauthenticated, and `credit_balances` leaks every user's balance via RLS
   bypass. Both are under an hour of work combined.
2. ✅ ~~Build the Stripe webhook~~ — built, deployed, and signature verification is armed
   in production. Still needs the **end-to-end 200** from Step 1 to be called done.
   (Test account `giancarlo@bravosboyz.com` has a manually-seeded active `traveler`
   subscription for testing the gate independently of a fresh purchase.)
3. **Finish deployment** — Steps 2–6 above.
4. Business (recurring) plans are untested; only the one-time traveler plan is exercised.
5. Email verification is stubbed; no payment-failure error page.
6. `activity_listings` and `service_listings` are empty — no data authored yet.

---

## Key files

- `SECURITY.md` — trust boundaries, verified audit, hardening playbook, operator tooling
- `backend/server.js` — all API routes, CORS, pool config, Stripe checkout, Claude tool loop
- `backend/payments.js` — Stripe checkout, webhook fulfillment, `getEntitlement`
- `backend/railway.env` — **gitignored** paste-block for Railway → Variables → Raw Editor
  (production values; kept separate so `NODE_ENV=production` + prod URLs never leak into
  local `npm start`). Editing it does NOT change the live values — paste it into Railway.
- `backend/railway.json` — Nixpacks build, `npm start`, health check on `/api/health`
- `landing/src/lib/mapApp.js` — cross-origin session hand-off helper
- `landing/src/components/NavBar.jsx` — redesigned banner (brand tile, Launch App, profile menu)
- `landing/src/pages/{Home,LogIn,SignUp,Pricing,Success,Account}.jsx`
- `frontend/src/components/AccessGate.tsx` — paywall gate + session adoption
- `frontend/src/lib/{api.ts,supabase.ts}` — backend fetch helpers, Supabase client
- `frontend/src/App.tsx` — map app shell
