# Vieques AI — Landing Page Design Brief

Handoff document for design work on `landing/`. Written 2026-08-07 from the
code as it actually stands, not from intent.

**Read this first if you are about to restyle anything.** The landing page and
the map app are two separate applications with two unrelated styling systems,
and the most common mistake is assuming a change in one reaches the other. It
does not.

---

## 1. What this product is

An interactive map of Vieques, Puerto Rico, with an AI guide. Travelers buy a
time-boxed pass ($7.99 / $13.99 / $24.99) and get beaches, restaurants,
activities, snorkeling zones, and directions on one map.

**The visitor we are designing for is on a phone, on the island, possibly on
bad cell service, deciding whether to spend $14 right now.** They are not at a
desk. Almost every design tradeoff below resolves in favor of that person.

---

## 2. The two-app split — the single most important fact

| | `landing/` | `frontend/` |
|---|---|---|
| **What** | Marketing site + auth + checkout | The actual map app |
| **Language** | Plain JSX (`.jsx`) | TypeScript (`.tsx`) |
| **Styling** | Hand-written CSS in `public/styles.css` | Tailwind utility classes |
| **Components** | Hand-rolled | shadcn/ui + vaul |
| **Breakpoint** | 640 / 760 / 820 / 900px (see §5) | One: 640px |
| **Deploys as** | Its own Vercel project | Its own Vercel project |

They share **no** CSS, **no** components, and **no** tokens. The visual
similarity is maintained by hand, and it has already drifted.

**Scope rule:** unless told otherwise, design work on "the landing page" means
`landing/` only. Touching `frontend/` means learning the vaul sheet geometry
documented in the project's responsive-architecture notes — a much larger job
with several non-obvious constraints (snap points, safe-area insets, a modal
Radix dialog that traps focus).

---

## 3. Design tokens — the intended source of truth

Defined at the top of `landing/public/styles.css`. Changing these re-skins the
whole page:

```css
--bg:        #0b1120;   /* deepest navy — hero, footer      */
--bg-alt:    #0f172a;   /* body background                  */
--panel:     #111c33;   /* raised surfaces                  */
--border:    rgba(148,163,184,.14);
--text:      #e2e8f0;   /* primary copy                     */
--muted:     #94a3b8;   /* secondary copy                   */
--accent:    #06b6d4;   /* cyan — CTAs, active states       */
--accent-lt: #67e8f9;   /* hover, eyebrow text              */
--accent-dk: #0e7490;   /* gradient foot                    */
--ink:       #0b1120;   /* text ON accent (never white)     */
--radius:    14px;
--font-head: 'Space Grotesk'  /* headings, prices, brand    */
--font-body: 'Manrope'        /* everything else            */
--pad-x:     clamp(20px, 5vw, 64px);  /* horizontal gutter  */
```

**Dark mode only.** There is no light theme and no `prefers-color-scheme`
block. The palette is fixed dark navy + cyan. Do not add a theme toggle
without asking — it is a product decision, not a styling one.

### The visual language, in three rules

1. **Cyan is for action.** Buttons, active toggles, links, the featured plan
   ring. Never decorative. If something is cyan, it should be tappable.
2. **Surfaces are layered gradients, not flat fills.** Cards use
   `linear-gradient(160deg, rgba(30,41,59,.6), rgba(15,23,42,.55))` plus an
   `inset 0 1px 0 rgba(255,255,255,.04)` top highlight. Sections alternate
   with large soft radial gradients. Flat `background: #111` will look wrong
   next to everything else.
3. **Text on cyan is `--ink` (near-black), never white.** Cyan `#06b6d4` does
   not pass contrast against white text at body sizes.

---

## 4. Page inventory

| Route | File | Notes |
|---|---|---|
| `/` | `pages/Home.jsx` | Hero, how-it-works, features, trust, pricing teaser, CTA, footer |
| `/pricing` | `pages/Pricing.jsx` | Full feature matrix + add-ons + business waitlist |
| `/signup` `/login` | `pages/SignUp.jsx` `LogIn.jsx` | Supabase auth |
| `/account` | `pages/Account.jsx` | Pass status, credit balance |
| `/success` | `pages/Success.jsx` | Post-Stripe receipt |
| `/terms` `/privacy` `/refunds` | `pages/Legal.jsx` | One component, three routes |

Shared: `components/NavBar.jsx`, `components/IOSPhoneFrame.jsx`
(an SVG iPhone bezel wrapping a real screenshot).

`pages/Map.jsx` is **0 bytes** — an empty placeholder. The real map is the
separate `frontend/` app.

---

## 5. Responsive behavior — and where it is broken

All landing breakpoints, complete:

```css
@media (max-width: 640px)  /* hide nav center links + brand subtitle */
@media (min-width: 760px)  /* .steps → 3 cols, .trust → 3 cols, .plans → 2 cols */
@media (min-width: 820px)  /* .cards → 2 cols */
@media (min-width: 900px)  /* .hero-grid → 2 cols */
```

Base styles are mobile-first (single column), which is the right instinct.
Four ad-hoc breakpoints is the problem: 760/820/900 are three different
"tablet" answers with no rationale, so the page reflows three times across a
140px range.

### Known bugs — verified, worth fixing before any restyle

**A. The pricing grid orphans a card (`styles.css:273-274`).**
`.plans` is `repeat(2,1fr)` above 760px, but `Home.jsx` renders **three**
plans into it. Result: two cards on row one, one stranded card on row two.
On an iPad this is the money section, and it looks broken.
Fix — replace the fixed 2-column rule with the intrinsic pattern already
used successfully in `Pricing.jsx:plans`:
```css
.plans { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
```
This needs no media query at all and handles 1/2/3 cards at any width.

**B. `.link` is used but never defined.**
`Home.jsx:231` and several `Legal.jsx` spots use `className="link"`. There is
no `.link` rule in `styles.css`, so "Compare every feature →" renders as plain
body text with no affordance. Either define it (cyan, per rule 1) or drop it.

**C. `Pricing.jsx` is a parallel design system.**
It does not use `styles.css` at all — it has a ~60-key inline `styles` object
at the bottom with hardcoded hex values (`'#06b6d4'`, `'#e2e8f0'`,
`'rgba(148,163,184,.14)'`) duplicating the tokens. Change `--accent` and the
pricing page keeps the old cyan. It also cannot express `:hover`, `:focus`, or
media queries — inline styles have no pseudo-class support, which is why that
page has no hover states.
This is the largest source of future drift. Migrating it to `styles.css`
classes is the highest-value cleanup on the site.

**D. No tablet story anywhere.** Same gap as the map app. Between 641px and
900px the hero is still single-column while cards have gone two-up, which
reads as an unfinished layout on iPad portrait (768px).

---

## 6. Mobile priorities — the actual ask

Ranked by impact on the phone user from §1.

1. **Fix the orphaned pricing card (bug A).** Highest visibility, smallest
   diff, directly on the conversion path.
2. **Audit tap targets.** Apple/Google both want ≥44×44px. Current
   `.btn` is `11px 20px` padding on 14px text ≈ 40px tall — marginally
   under. `.profile-item`, `.toggle button`, `.chip`, and footer nav links
   are smaller still. Footer links sit in a `flex-wrap` row with `gap:20px`
   and no vertical padding, which is the worst offender on the site.
3. **Consolidate 760/820/900 into two deliberate breakpoints** —
   e.g. 640 (phone→tablet) and 1024 (tablet→desktop). Fewer reflows, and it
   finally gives iPad a defined layout.
4. **Verify the hero on a real short viewport.** `.hero` padding is
   `clamp(56px,9vw,110px)` top and the phone mockup is `min(340px,100%)`.
   On a 667px-tall iPhone SE the CTA buttons likely fall below the fold.
   Worth measuring — the CTA is the whole point of the hero.
5. **Consider `prefers-reduced-motion`.** `.phone-wrap` runs a 6s infinite
   `floaty` transform and `.dot` pulses forever. There is currently no
   `@media (prefers-reduced-motion: reduce)` block anywhere. This is an
   accessibility gap and a small battery cost on mobile.
6. **`overflow-x: hidden` on `body` is masking something.** It is set at
   `styles.css:26`. It hides horizontal overflow rather than preventing it —
   worth finding the actual overflowing element instead.

### Already handled well — do not "fix" these

- **Safe-area insets.** `.nav` correctly uses
  `env(safe-area-inset-top/left/right)` with `viewport-fit=cover` in
  `index.html`. The notch is handled. Keep this if you rewrite the nav.
- **The phone mockup's rendering.** `.phone-shot` has `will-change: transform`
  and `image-rendering: high-quality` with a load-bearing comment explaining
  that the parent's infinite animation otherwise rasterizes the subtree once
  at CSS size and upscales it — it looked blurry on retina. Do not remove
  these without reading that comment.
- **Scroll reveal.** `.reveal` + IntersectionObserver in `Home.jsx:18-37`,
  with a correct no-IO fallback that adds `.in` to everything. Works.

---

## 7. Constraints — things that will break if changed

- **`--ink` on cyan.** See §3 rule 3. Contrast.
- **`.hidden { display:none }`** drives the traveler/business pricing toggle in
  `Home.jsx:182,218`. It is not a utility class you can repurpose.
- **`IOSPhoneFrame` locks 9:19.5.** The screenshot is 1170×2532. A different
  aspect ratio will letterbox or crop.
- **Fonts load from Google Fonts** via `<link>` in `index.html` with
  `preconnect`. Only Space Grotesk (500/600/700) and Manrope (400/500/600/700)
  are loaded — using any other weight silently synthesizes it.
- **`styles.css` lives in `public/`, not `src/`.** It is served as a static
  asset via `<link href="/styles.css">`, so it is **not** processed by Vite:
  no imports, no nesting, no autoprefixing, no bundling, no cache-busting
  hash. If you want any of that, the file has to move into `src/` and be
  imported from `main.jsx`.
- **Legal copy is real.** Terms/privacy/refunds text is referenced by Stripe.
  Restyle freely, but do not rewrite the wording.

---

## 8. What good looks like

A restyle is successful if:

- Every color comes from a `var(--token)`, including on the pricing page.
- The page reflows at **two** breakpoints, not four, and iPad portrait
  (768×1024) looks deliberate.
- Every tappable thing is ≥44px in its smaller dimension.
- The three pricing cards sit in one row on tablet and desktop, and stack
  cleanly on phone, with no orphan.
- Nothing scrolls horizontally at 320px wide *without* relying on
  `overflow-x: hidden`.
- Cyan still means "you can tap this," and nothing else.

---

## 9. Quick reference

```
landing/
├── index.html                  # fonts, viewport-fit=cover, theme-color
├── public/styles.css           # ← 294 lines. The design system.
└── src/
    ├── App.jsx                 # routes
    ├── components/
    │   ├── NavBar.jsx          # sticky, safe-area aware, profile dropdown
    │   └── IOSPhoneFrame.jsx   # SVG bezel, locked 9:19.5
    └── pages/
        ├── Home.jsx            # 261 lines, 13 inline styles
        ├── Pricing.jsx         # 363 lines — parallel style object (bug C)
        ├── Legal.jsx           # terms/privacy/refunds
        ├── Account.jsx  SignUp.jsx  LogIn.jsx  Success.jsx
        └── Map.jsx             # EMPTY — real map is frontend/
```

Run locally: `cd landing && npm run dev` (Vite, port 5174).
