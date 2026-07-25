# Deploying the map app (frontend/)

The map app is a static Vite SPA. It deploys as its **own Vercel project**,
separate from the landing site, mirroring `landing/vercel.json`.

## Vercel setup (one time)

1. New Project → import this repo.
2. **Root Directory: `frontend`** (important — the repo has multiple apps).
3. Framework preset: Vite. Build command / output are read from
   [`vercel.json`](./vercel.json) (`npm run build` → `dist`, SPA rewrite so deep
   links resolve to `index.html`).
4. Add a domain, e.g. **`app.explorevieques.org`** (CNAME to Vercel).

## Environment variables (Vercel → Settings → Environment Variables)

See [`.env.example`](./.env.example). Set all of:

| Var | Production value |
| --- | --- |
| `VITE_MAPTILER_KEY` | MapTiler key |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_BASE` | Railway backend URL (e.g. `https://<app>.up.railway.app`) |
| `VITE_LANDING_URL` | `https://explorevieques.org` |

## Cross-origin wiring (must match, or auth/API breaks)

- **Landing** project env `VITE_APP_URL` → `https://app.explorevieques.org`.
  This is where `landing/src/lib/mapApp.js` sends the user with the Supabase
  session in the URL hash. `AccessGate` in the map app adopts it.
- **Backend** (Railway) env `APP_URL` → `https://app.explorevieques.org` and
  `LANDING_URL` → `https://explorevieques.org`. The CORS allowlist in
  `backend/server.js` is built from these two, so the app origin must be set or
  API calls from the deployed map app are rejected.

## Verify after deploy

1. Load `https://app.explorevieques.org` directly → should bounce to the landing
   login (AccessGate) when unauthenticated.
2. From the landing site, log in and launch the map → lands authenticated (no
   redirect loop), map tiles + category data load, no CORS errors in console.
3. On iPhone Safari: Share → Add to Home Screen → opens full-screen (standalone),
   ocean icon, UI clears the notch and home indicator.
