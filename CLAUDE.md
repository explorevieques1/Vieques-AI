# Explore Vieques — CLAUDE.md

AI-powered, map-based travel discovery app for Vieques, Puerto Rico. Users sign up, pay
for a plan, and get an interactive island map (beaches, restaurants, activities,
transport, essentials, snorkeling) with an AI assistant that drops answers as map pins.

This file is the fast-orientation guide for working in this repo. For the exhaustive
history — deploy runbook, every gotcha, security audit — see
[`data/docs/CLAUDE.md`](data/docs/CLAUDE.md) and [`SECURITY.md`](data/docs/SECURITY.md)
(older, more detailed, occasionally stale on "current status" — trust this file and the
vault for *current* state, trust that file for *mechanism*).

## Three apps + one database

| App | Folder | Dev port | Prod | Purpose |
|---|---|---|---|---|
| Landing | `landing/` | 5174 | explorevieques.org (Vercel) | Marketing, sign-up, login, pricing, checkout |
| Map app | `frontend/` | 5173 | app.explorevieques.org (Vercel) | The product — the interactive map |
| Backend API | `backend/` | 3001 | Railway (`explore-vieques-production.up.railway.app`) | Gatekeeper: only thing that talks to Postgres, Stripe, Gemini |
| Database | — | — | Supabase (Postgres + PostGIS) | Content + auth + payments |

**Gatekeeper rule:** the browser never talks to Postgres, Stripe, or the AI provider
directly — always through `backend/`.

Stack: Landing is React+Vite (JS) with plain CSS. Map app is React+Vite+TypeScript,
Tailwind, **MapLibre GL**. Backend is Node/Express (ESM) + `pg` + Stripe. AI chat runs on
Gemini (cheap), not Anthropic (that key is paid-for but currently unused — see TODO
below).

## Current real status (as of 2026-11-12 — see the vault for the living version)

Deployed and working end-to-end again. The backend was silently down from ~mid-August
to now, which killed all sales during that window — there was no uptime monitoring, so
nobody noticed. Real revenue to date: **2 Stripe sales, $18.98**, both in the first two
weeks of August; zero since. 24 signups, momentum stalled by the outage, not by the
product. Core risk right now is **unvalidated conversion** (24 signups → 2 sales), not
code quality.

Don't re-derive this from scratch — it's tracked live in the vault (below). This section
exists so a fresh session isn't flying blind before it even opens the vault.

## The knowledge vault — read this before planning any non-trivial work

All project memory, planning, and history beyond "how the code works" lives in a
**separate Obsidian vault**, not in this repo:

```
/Users/giancarlo/Desktop/Exlpore VIeques/
```

(Own git repo, remote `explorevieques1/explore-vieques-vault`, independent of this
code repo's remote.) Start at `Home.md`. Key sections:

- `01 - Honest Review/` — plain-English state of the app, no hype.
- `02 - Systems Blueprint/` — every service, the full route inventory, the DB study,
  architecture/payment/AI-chat diagrams (`.drawio` + Mermaid twins).
- `03 - Updates Log/` — dated session log, reverse-chronological. **Read the latest
  entry at the start of a session** to pick up where things left off.
- `04 - Features & Ideas/_Feature Backlog.md` — prioritized idea table.
- `05 - Tasks & Checklists/_TODO Board.md` — Now / Next / Later, the actual punch list.

Use the `vault-log` skill to write new session entries there — never hand-edit vault
notes from a generic Edit call, and never put vault content inside this code repo.

## Agents & skills — what to reach for, and when

This repo has project-specific tooling already wired up. Use it instead of ad hoc
review or generic skill picks:

| Task | Use | Notes |
|---|---|---|
| Reviewing a diff/PR before commit | `vieques-diff-reviewer` agent | Project-aware: checks auth gates, Stripe webhook signature verification, Supabase RLS, map-app/landing cross-imports. Read-only, reports only. |
| Commit + push + log | `/ship` slash command | Runs the reviewer first, then commits to the `explore-vieques` remote, then chains `vault-log`. This is the normal end-of-session action — don't hand-roll `git push`. |
| Logging a session to the vault | `vault-log` skill | Run after `/ship`, or whenever asked to "update the vault." Never edits this code repo. |
| **UI design work** (landing redesign, conversion pass, visual polish anywhere) | `frontend-design` skill **and** `unslop-ui` skill | Load both before touching landing/frontend visuals. `frontend-design` for aesthetic direction/typography so it doesn't read as templated; `unslop-ui` to catch vibe-coded anti-patterns (icon-in-rounded-square, gratuitous gradients, glassmorphism, broken scroll-reveal animations). The vault's own [[Landing Conversion Pass]] note calls these out by name as the intended tools — don't skip them for landing work. Then follow "Landing design system" below and reuse the vendored React Bits in `landing/src/components/reactbits/`. Verify visually with Playwright at 1440 and 390 wide. |
| **Map work** (MapLibre layers, markers, interactions, map UI) | No dedicated skill yet — use the Playwright MCP browser tools to visually verify changes in a running `frontend` dev server, since map state is interactive and hard to judge from a diff alone | See "Map app — where things live" below for the files that matter |
| Checking Vercel deploy status/config | Vercel MCP tools, or the `vercel:*` skills (`vercel:status`, `vercel:deploy`, `vercel:deployments-cicd`) | Both Vercel projects (frontend + landing) auto-deploy on push to `main` via GitHub — a plain `git push` is sufficient, no manual `vercel deploy` needed. See the vault's Services Overview for current wiring. |
| Supabase schema/data questions | Supabase MCP tools (`list_tables`, `execute_sql`, `get_advisors`) | Check RLS and advisors before any schema change, per the server's own guidance. |

Don't spin up a generic review or a from-scratch design pass when one of these already
exists for this repo — they encode project-specific gotchas a fresh agent would have to
re-derive.

### Map app — where things live

The map app (`frontend/src/`) is MapLibre GL on top of Supabase content tables:

- `components/MapView.tsx` — the map shell/instance.
- `components/MapModesBody.tsx`, `MapSearchBar.tsx`, `ResultsList.tsx`, `SavedBody.tsx`,
  `ProfileBody.tsx` — surrounding UI chrome around the map.
- `lib/mapStyles.ts` — base map style config.
- `lib/zoneLayers.ts`, `lib/trailLayers.ts`, `lib/RouteLayer.ts` — the data-layer code
  (zones/snorkel areas, trails, routing via OSRM+PostGIS on the backend).
- `components/AccessGate.tsx` — paywall gate + cross-origin session adoption (see below)
  — sits in front of the whole map experience, not part of the map itself but easy to
  break map testing on if you forget it needs a valid session/subscription.

Known open map-adjacent item from the backlog: the **tablet layout gap (641–1024px)** —
iPad portrait has no room for the map alongside chrome. Flagged in `PLATFORM.md`, tracked
on the vault's TODO board under "Later."

### Landing — where things live

`landing/src/pages/{Home,LogIn,SignUp,Pricing,Success,Account}.jsx`,
`landing/src/components/NavBar.jsx`, all styles in `landing/public/styles.css` (one
global sheet, tokens on `:root`). Redesigned 2026-11-12 — see "Landing design system"
below before changing anything visual.

- `components/AuthLayout.jsx` — shared frame for LogIn + SignUp (terrain, pitch,
  StarBorder card, capsule nav with a page-specific `navAction`). ForgotPassword,
  ResetPassword, Welcome and Account are recoloured but **not yet on AuthLayout**.
- `components/Phone3D.jsx` — the hero iPhone (CSS 3D, no three.js). Screen = real
  screenshot (`app-screenshot-{720,1080}.jpg` srcset) + an HTML Ask AI demo loop.
  **Nothing on the screen may zoom/translate the screenshot** — it moves the baked-in
  tab bar out of place. Planned next: flip Beaches → Restaurants → Activities with
  HTML pins over a pin-free map capture.
- `components/HeroTerrain.jsx` — lazy, idle-loaded React Bits `Topography` (WebGL2),
  skipped on save-data / no WebGL2.
- `components/reactbits/` — vendored React Bits (JS-CSS variants): Topography,
  SplitText, ScrollReveal, AnimatedContent, SpotlightCard, LogoLoop, StarBorder, Magnet.
  Add more with `curl https://reactbits.dev/r/<Name>-JS-CSS.json` and copy `files[]`;
  prefer components needing only `gsap` or nothing (no `motion`, no three.js).
- `src/content/faq.js` — the homepage FAQ **and** the FAQPage JSON-LD (injected into
  `index.html` by the `seo-jsonld` plugin in `vite.config.js`). Edit answers only here.
- `lib/plans.js` — `PLAN_HIGHLIGHTS` (card bullets) lives beside the feature matrix.
- SEO: keyword-led title/meta, canonical, OG/Twitter (`public/og-image.jpg`),
  `robots.txt`, `sitemap.xml`. **Still client-rendered** — prerendering is the next SEO
  unlock (vault: SEO & Discoverability Pass).

### Landing design system (keep to it)

- **Palette roles:** `--pearl #04141E` base (~70%), `--sea #64DBE8` map lines / links /
  selected state (~20%), `--flush #FF6D04` **only** on start/buy actions (~10%). Orange
  on anything you can't press is a bug.
- **Type:** system UI face (SF Pro on Apple) with Inter fallback; heavy, tight-tracked
  large titles, iOS-style.
- **iOS idioms:** capsule buttons, floating capsule nav, segmented controls, inset
  grouped lists (FAQ, add-ons), opaque surfaces — no glassmorphism.
- **Motion:** one load moment per page + purposeful scroll reveals; every React Bits
  component already honours `prefers-reduced-motion` — keep that true.
- **Copy:** real numbers from Supabase only (17 beaches, 35 restaurants, …); never round up.
- `public/styles.css` is linked, not imported — Vite doesn't hot-reload it; hard-refresh.
- `overflow-x: clip` (not `hidden`) on html/body and on sections holding StarBorder,
  whose glow canvas bleeds 48px by design; `hidden` would break the sticky nav.

### Map app — bottom nav

`frontend/src/components/BottomNav.tsx` is a floating, icon-only capsule. Its footprint
is the CSS var `--nav-clear` (`index.css`) and `BOTTOM_NAV_H`/`BOTTOM_NAV_GAP`
(`hooks/useMapInsets.ts`) — change all three together; 8 panels pad by `--nav-clear`.

## Cross-origin session hand-off (landing ↔ map app) — don't regress this

Landing (5174) and map app (5173) are different origins, so a Supabase session in
`localStorage` on one is invisible to the other.

- Landing hands off via **URL hash**: `landing/src/lib/mapApp.js` →
  `mapUrlWithSession(session)` → `${APP_URL}/#access_token=...&refresh_token=...`. Use
  `launchMapApp()` for every "open the map" path.
- Map app adopts it in `frontend/src/components/AccessGate.tsx` (reads hash → `setSession`
  → strips hash). Its Supabase client has `detectSessionInUrl: false` so it doesn't fight
  this (`frontend/src/lib/supabase.ts`).

Full gotcha list (Supabase pooler `search_path`, CORS dev-port handling, Stripe webhook
payload style) lives in `data/docs/CLAUDE.md` — read it before touching backend DB
connection code, CORS config, or the Stripe webhook handler specifically.

## Local development

```bash
cd backend && npm start      # 3001
cd landing && npm run dev    # 5174, strictPort
cd frontend && npm run dev   # 5173
```

Each folder has its own `.env` (never commit real values, only `.env.example`).
