# Vieques Cards — UI spec (rule-ID'd)

Text twin of **Card UI Mapping.pdf** (vault: `04 - Features & Ideas/Card UI Mapping.pdf`).
Same rule IDs. The `cards-ui-guard` agent checks Cards UI diffs against this file.

**Change order:** spec first (this file + the PDF, together), then code. If code and spec
disagree, the code is wrong until the spec is updated on purpose.

Scope: every Cards UI surface in the map app (`frontend/src/`). Backend lives in
`backend/cards.js` (0055); admin authoring in `backend/admin.js` — not covered here.

Owner decisions (2026-11-19): radar button in the map control stack · hold to collect ·
sound on with mute · free React Bits only.

---

## 0 · The system Cards must match

- Dark only (`<html class="dark">`). Glass `oklch(0.17 0.028 258)`; primary teal
  `oklch(0.87 0.126 175)`; `--accent-sky`; muted fg `oklch(0.68 0.03 258)`.
- Type: Geist (UI) · Instrument Serif `font-display` (pane/place titles) · Geist Mono
  10px uppercase `tracking-[0.14em]` micro-labels (`ProfileBody` `sectionLabel`).
- Icons: `lucide-react` only, inline. No emoji as UI.
- Primary CTA: `bg-gradient-to-br from-primary to-accent-sky rounded-2xl h-12
  font-semibold text-primary-foreground`. No orange in the map app.
- Reuse: `GlassSurface` + `LIQUID_GLASS` (`lib/glass.ts`), `GlassControl`, `PillSlider`,
  `SavedBody` `tab()`, `MenuBody` `Group`/`Row`, `AddToTripSheet` modal pattern,
  ResultsList inline upsell card, `markerIcon.ts`, `zoneLayers.ts` pattern,
  `CameraDirector` + `padding()`.
- z ladder: map/markers — · controls 10 · desktop panels 20 · mobile chrome 30 ·
  scrims 35–40 · sheet 50 · nav 60 · modal 70 · loader 9999.

---

## C · Components

**Allowed inventory** (free registry `reactbits.dev/r/<Name>-JS-CSS.json` → HTTP 200,
`dependencies: []`, verified 2026-11-19):

| Component | Renderer | Use | Live at once |
|---|---|---|---|
| HoloCard | WebGL | Opened card (reveal + detail); preset per rarity; `backImage` | 1 |
| TiltedCard | CSS | Collection grid thumbnails (touch tilt only) | any |
| PixelCard | Canvas2D | "Something's here…" in the nearby banner | 1 |
| Radar | WebGL | Sweep in the radar pill; `targets` = count bucket | 1 |
| HoldButton | CSS | "Hold to collect" (~1 s) | 1 |
| Counter | CSS/SVG | Serial roll-up; leaderboard points | any |
| ShinyText | Canvas2D | RARE / LEGENDARY labels only | few |
| ElectricBorder | WebGL | Legendary opened card only | 1 |
| StickerPeel | WebGL | Achievement-unlocked badge moment | 1 |
| BounceCards | CSS | Achievement set fan-out | 1 |
| SplitFlapText | CSS | "Your rank" on Top Traveler | 1 |
| ClickSpark | Canvas2D | Sparks on completed hold | 1 |
| SoundEngine + SoundCoin / SoundReveal / SoundTreasure / SoundPing (`-JS`) | Web Audio | collect / card appears / legendary / radar warmer | — |
| GlareHover (optional) | CSS | Sweep on common/basic grid cards | any |
| ReflectiveCard (optional) | WebGL | Legendary "platinum" reveal | 1 |

**Excluded:** SwipeToast, CountUp, RubberSegment, StatusMark, TearTicket, FlipCard,
Stack, DecryptedText (need `motion`) · BorderGlow (three) · ProfileCard (superseded) ·
Scratch Card (Pro).

- **C-1** Only components in the inventory above. ReflectiveCard's two `@hugeicons`
  icons are inlined as SVG (as Carousel/SlideCommit did) — no icon packages added.
- **C-2** Vendor verbatim into `frontend/src/components/reactbits/<Name>.{jsx,css}` + a
  hand-written `<Name>.d.ts` (tsconfig has no `allowJs`). Only change: drop
  `'use client'` (and inlined icons per C-1). Tune at the call site with a comment.
- **C-3** Card UI is lazy-loaded (`React.lazy`/dynamic import) — the map's first load
  must not include it.
- **C-4** No `motion`, `gsap`, `three`, or any new npm package for Cards UI.

## L · Layering

- **L-1** Radar pill and nearby banner: `position: fixed`, `z-30`,
  `pointer-events-auto` (the vaul sheet sets `pointer-events:none` on `<body>`).
- **L-2** Claim reveal, card detail, riddle sheet: `fixed inset-0 z-[70]`, the
  `AddToTripSheet` pattern, bottom padding includes `var(--sab)`; desktop centres
  (`sm:items-center`) with a scrim.
- **L-3** Floating surfaces anchor to the live sheet edge:
  `bottom: calc(100dvh - var(--controls-y) + 8px)` (banner directly on the sheet, pill
  above the banner). Never a hard-coded bottom offset.
- **L-4** Pill + banner hidden when the sheet is at full (`--sheet-full > .5`), the
  radar is off, a z-70 overlay is open, or (≥641px) the map band between panels is
  under `DESKTOP_CARDS_MIN_BAND` (240px). With a place open (PlaceDetailPanel), the
  banner collapses to a slim one-line "card nearby".
- **L-5** Collection is a sheet pane: a `sheetBody` branch, opens at `SHEET_FULL`, has
  `onCollapse` (⌄). Desktop: `ResponsivePanel variant="floating"` in Saved's slot.
- **L-6** The Collection entry is added to `MenuBody` **and** the `MapTopBar` desktop
  dropdown.

## G · Glass

- **G-1** `GlassSurface` only on surfaces ≤ 64px tall (radar button 48, pill 40,
  `className="vq-glass …"`). Taller surfaces (banner, panes, overlays) use the frosted
  CSS recipe of `.vq-map-sheet`.
- **G-2** No `opacity < 1`, `filter`, `mask`, `clip-path`, `will-change` or transform
  animation on an ANCESTOR of a GlassSurface. To fade, fade the glass element itself.
- **G-3** No Tailwind `shadow-*` on glass.

## P · Pins

- **P-1** Card markers live in their own `cardMarkersRef`. `clearMarkers()` never touches
  them, and they never hide, gate or suppress category or Ask AI markers.
- **P-2** Card markers exist only while the radar is on; removed on radar off and on
  unmount.
- **P-3** Marker element `style.zIndex = 2` (above category pins). Tap →
  `stopPropagation` → opens card detail (S-7).
- **P-4** Collect-ring GL layers: source `cards-ring`, layers `cards-ring-fill`,
  `cards-ring-line`; redrawn when `styleId` changes (trails pattern, not zones);
  removed with the radar.
- **P-5** The client never holds or draws an unrevealed card's coordinates; only
  revealed/owned cards from the API are drawn.

## M · Camera & motion

- **M-1** Never auto-fly the camera on reveal or collect. Only an explicit "Show on map"
  flies, via `director.fly(pointShot(...), padding())`.
- **M-2** While the nearby banner is visible, its measured height is added to the
  bottom camera inset (`useMapInsets`).
- **M-3** `prefers-reduced-motion`: no radar sweep, foil animation, tilt, flip-board,
  sparks, peel or roll-up; reveal = fade; riddle shake = border flash. Sound still
  allowed.
- **M-4** One entrance moment per surface. The only looping animation is the radar
  sweep while the radar is on.

## W · WebGL & performance

- **W-1** ≤ 4 live WebGL contexts: map + Radar + one opened card (HoloCard /
  ReflectiveCard) + one moment (StickerPeel / ElectricBorder).
- **W-2** Radar paused (static frame) when `document.hidden`, sheet at full, a z-70
  overlay is open, or the pill is hidden by the narrow-band rule (L-4). WebGL components unmount when their surface closes.
- **W-3** The grid uses TiltedCard (no WebGL), touch tilt only (no gyro); only one
  opened card at a time.

## I · iOS & device

- **I-1** Audio unlock (SoundEngine) and `DeviceOrientationEvent.requestPermission()` are
  called only inside a user tap handler (radar button or card open).
- **I-2** `navigator.vibrate` is feature-detected and optional (iOS has none).
- **I-3** Sound on by default; mute persisted in `localStorage` inside try/catch; toggles
  in the radar pill and the Collection settings row.

## R · Radar & states

- **R-1** `/api/cards/nearby` pings only while the radar is on, after ≥ 75 m moved,
  ≤ every 20 s, never while `document.hidden`.
- **R-2** Every lock/error state shows the copy in S-2 / S-4 plus a next step.

## T · Visual tokens

- **T-1** Colours only from tokens: `--color-rarity-common` `oklch(0.78 0.02 250)`,
  `--color-rarity-basic` `var(--primary)`, `--color-rarity-rare` `oklch(0.75 0.2 320)`
  (orchid, not stays violet `#8b5cf6`), `--color-rarity-legendary` `#E2A400`; plus
  primary / accent-sky / muted. No orange (`#FF6D04`), no other raw hex in components.
  `lib/rarity.ts` maps rarity → token, HoloCard preset/intensity, sound.
- **T-2** lucide icons only; no emoji in UI chrome, labels or copy. Medals = lucide
  `Medal` in gold `#E2A400` / silver `#C0C7D0` / bronze `#C77B3A`.
- **T-3** Titles `font-display`; micro-labels mono 10px uppercase `tracking-[0.14em]`;
  body Geist.
- **T-4** Primary actions use the existing teal→sky gradient CTA; HoldButton fill matches.
- **T-5** Segmented control = `SavedBody` `tab()` styles (labels never wrap: `whitespace-nowrap`); chip rows = `PillSlider` (never
  hand-roll a chip row); list rows = `MenuBody` `Group`/`Row`.

## X · Geometry

- **X-1** Unchanged: `TOP_BENTO_H` 108, `BOTTOM_NAV_H` 56, `BOTTOM_NAV_GAP` 12, sheet
  snaps `176px / 0.45 / 0.93`, the nav's 27px inset, and the variables written by
  `useSheetMotion` (`--controls-y`, `--sheet-low`, `--sheet-full`, `data-nav-hidden`).
- **X-2** New sizes (radar pill 40px, banner height, card pin 26×36) are named constants
  in `hooks/useMapInsets.ts` (or `lib/rarity.ts` for pin size).

---

## S · Surfaces

**S-1 Radar button.** New `GlassControl` (48px, `CONTROL_GLASS`) in the right control
stack below recentre; lucide `Radar`. Off = muted; on = `text-primary` + 6px dot;
`aria-pressed`. First tap: unlock audio + iOS motion permission (I-1).

**S-2 Radar pill.** `GlassSurface` 40px tall, radius 20, `vq-glass vq-glass--tight`,
left side, above the banner/sheet (L-3), `z-30`. Content: 28px Radar (teal,
`mode="sweep"`, `ringCount 3`, `spokeCount 0`, `mouseInteraction={false}`,
`intro={false}`, `grain 0`) · text · mute (lucide `Volume2`/`VolumeX`).
Copy: `Scanning…` · `No cards nearby · explore` (or `N on the map · go collect` when the radar's hidden count is 0 but N revealed, collectable pins — not owned, tier-locked or sold out — are within radar range, 1000 m; a fine pointer drops "· go collect", S-10) · `1 nearby` / `2–3 nearby` /
`4+ nearby` + `· cold|warm|hot|burning` (the server's `warmth()` words, shown
verbatim — owner's call 2026-11-19) · `Weak GPS · step outside` ·
`Cards live on Vieques` · `Turn on location to hunt cards`. SoundPing once per warmth
step up. Steps aside when the banner shows a revealed card.

**S-3 Card pins.** DOM marker 26×36, radius 5, 1.5px rarity rim, category-pin shadow;
`makeCardMarkerEl()` in `lib/markerIcon.ts`. States: revealed (card back) · owned (art
crop of the face) · legendary owned (gold glow) · locked (lucide `Lock`). Selected:
`marker-lift` to 34×47 + rarity pulse. Collect ring for the in-range card only (P-4).

**S-4 Nearby banner.** Frosted (G-1), full width minus 10px gutters, on the sheet edge.
States: ① PixelCard "Something's here… · within 200 m · walk closer" (SoundReveal) ·
② in range: rarity label, name, full-width HoldButton "Hold to collect" (1 s, drains on
release) → ClickSpark → claim · ③ on-site question: `font-display` prompt + input, hold
disabled until text; wrong → shake, "Not quite — look around", hint after 3 ·
④ locked: ResultsList-style upsell "A <pass> unlocks <rarity> cards…" + "See passes" →
`${LANDING_URL}/pricing`.
Errors: `TOO_FAR` (revealed) "Get a little closer · N m to go" · `TOO_FAR` (warmth)
"Not here — keep searching · <warmth>" · `LOW_ACCURACY` "Your GPS is fuzzy — step into
the open" (auto-retry) · `NOT_NOW` "This card appears <hours>" · `SOLD_OUT` "Every copy
has been collected" · `TOO_FAST` "Whoa, that was fast. Try again in a few minutes" ·
`TOO_MANY_GUESSES` "Try again in an hour" · `RIDDLE_UNSOLVED` "Solve the riddle first"
→ opens S-8.
**Owner rule (2026-11-19): only LEGENDARY cards have a riddle**, either a locate riddle or an on-site question. Common, basic and rare cards are walk up + hold. State ③ and S-8 therefore only ever appear for legendaries. Not enforced in code yet; authoring rule for the admin tool.
*Step 5 additions (owner-accepted defaults, 2026-11-19):*
- **Layout:** the right control stack lifts above the banner by the same rule as the pill (L-3). The 40×56 thumbnail is the PixelCard/thumb size.
- **More errors:**
  - `NOT_ON_ISLAND` → "Cards live on Vieques".
  - `NOT_FOUND` / `NO_LOCATION` → the server's sentence.
  - Network failure → "No connection — hold to try again".
  - `NOT_NOW` without hours → the server's sentence.
- **Cooldowns** (the server sends no retry time): `TOO_FAST` 3 min, `TOO_MANY_GUESSES` 60 min, with hold disabled and "Try again in m:ss".
- **`SOLD_OUT`:** adds a "See other cards nearby" button, which skips that card for the session.
- **④ locked:** shows anywhere within 200 m, not only in the collect radius.
- **Slim one-line mode** (when a place is open): "Card nearby · <name>", not tappable.
- **Placeholders until later steps:**
  - Until S-5 ships, a 2.6 s interim line: "Collected · #N", plus a check. S-5 replaces it.
  - Until S-8 ships, `RIDDLE_UNSOLVED` selects the card's pin.

**S-5 Claim reveal.** L-2 overlay. t0 ClickSpark (teal, 8) + overlay fade 180ms ·
t120 HoloCard (~300 wide, rarity preset) · t600 ShinyText rarity (rare+,
`trigger="view"` — plays once on first sight; upstream has no "once") · t700 Counter serial (`duration .7`) · legendary: ElectricBorder +
SoundTreasure (optional ReflectiveCard) · otherwise SoundCoin · t1500 achievement:
StickerPeel → BounceCards. Rest: Share (`navigator.share` with the face image) · Done
(also tap outside / swipe down). Android `vibrate(30)`. Radar paused while open.
The claim result is saved regardless of the animation.
*Step 6 additions (owner-accepted defaults, 2026-11-19):*
- **Real text under the card:** rarity · region, name, serial "#007 of 050", plus a micro-label "New card" (or "In your collection" when the claim comes back alreadyOwned).
- **BounceCards set:** the collected card plus the owned cards that share a tag with it. That's exact for tag rules and approximate for `a + b` rules, until the backend sends each badge's slugs.
- **Badge with no art:** a generated teal→sky disc with the lucide `Award` icon (`badgeStickerUrl`).
- **Layout:** the achievement stacks under a smaller card, and short screens scroll.
- **Several badges in one claim:** the first gets the sticker, the rest show as "Also: …".
- **Share:** the text is "<name> · <Rarity> · #NNN · Explore Vieques"; the button is hidden without `navigator.share`.
- **Legendary + achievement:** the ElectricBorder hands off to StickerPeel at t1500, to stay within W-1.
- **Taps in the first 450 ms are ignored.** Escape also closes the reveal.

**S-6 Collection pane.** Title "Collection" (`font-display`) + ⌄. Segments: Cards ·
Badges · Top Traveler (T-5).
- Cards: `9 / 24` + points; progress bar; region tallies (Group/Row, lucide `MapPin`,
  "1 of 4", riddle-locked under "Mystery"); PillSlider rarity filter; 3-column
  TiltedCard grid (3 on desktop too: 4 in the 344px panel gives ~70px cards with unreadable
  names — owner, 2026-11-20). Found = face; unfound = shared back; locked rarity =
  dimmed. Tap → S-7; long-press → flip to back. Settings row: Sound · Card radar.
- Badges: earned (static sticker image) first; in progress = dashed outline + progress
  bar "Beach Bum 3/5". Every badge still to earn is listed ("To earn · N", nearest-to-done
  first), each with its requirement (description, else "Collect N cards") and "+N pts"
  (owner, 2026-11-20).
- Top Traveler: This week / All-time; SplitFlapText "#07" (`loop={false}`, `padTo 3`,
  numeric); top 20 rows (rank / `Medal` 1–3, initials avatar, name = display name or
  first name + last initial, "N cards · N badges", points in Geist Mono via Counter);
  your row pinned (or highlighted in place if top 20); "N pts to pass #k". Opt-out
  users absent. Tab shown only when `/api/cards` returns `leaderboard: true` (testers until
  launch day; backend `LEADERBOARD_LIVE` flips with `CARDS_LIVE`, because the board shows
  other travellers' names).
  - This week = since Mon 00:00 America/Puerto_Rico; all-time = lifetime. Refetched on tab
    open and range switch (no polling, no pull-to-refresh: it fights the sheet drag, X-1).
    PDF "· nearest card: <area>" is not built (no data source).
  - Ties share a rank; board order points → cards → badges → stable id. On the board only
    with > 0 points in range. Testers never appear on customers' boards.
  - Your row: labelled "You" with your real initials; highlighted in place if top 20, else
    pinned (`sticky bottom-[var(--sab)]`). Header: micro-label "TO PASS #k" over "N pts"
    (aria-label "N pts to pass #k"); nobody above → "POINTS" / "N pts"; zero points → header
    hidden and the pinned row reads "Collect a card to join the board" + Turn on radar (T-4).
  - Opted out: you still see the rank you'd hold, no medal, "Hidden from others · change in
    Profile". Your points roll (Counter) only when changed since your last view
    (localStorage, per range).
  - Copy: all-time empty "Be the first Top Traveler."; failure "Couldn't load the
    leaderboard." + Try again.
- Empty: "Turn on the radar and explore — your first card is closer than you think." +
  Turn on radar · "Collect a set to earn a badge." · "No legendary cards yet — they hide
  in the hardest places." · "Be the first Top Traveler this week." · Filter on a
  common/basic/rare with none owned: "No <rarity> cards yet."
- Load failure: "Couldn't load your cards." / "Couldn't load your badges." + "Try again".
  Loading placeholders are static blocks (no pulse — M-4).

**S-7 Card detail.** L-2 overlay, one live HoloCard (`idle={false}`, M-4); tap flips
(`backImage`: island outline + find-spot dot, date (S-11), badges it counts toward — empty
until the API sends achievement rules). "Tap to flip" hint row (lucide `RotateCw`). Lore;
"Show on map" (M-1; neutral bordered secondary button, not T-4) + Share (48px icon button).
- Owned: everything above. Share only here (same text/file as S-5; hidden without
  `navigator.share`).
- Revealed, not owned: HoloCard front, no flip, no serial; Show on map yes, Share no.
- Unfound → silhouette (static shared back in a rarity rim; rarity, region unless
  riddle-locked → "Mystery", hint; no name/art). Title "Not found yet". Riddle-locked →
  "Solve the riddle" (T-4, lucide `KeyRound`), which closes S-7 and opens S-8 (one z-70
  overlay at a time).
- Locked rarity → silhouette dimmed + "A <pass> pass unlocks <rarity> cards." + "See passes".
- Close: lucide `X`, tap outside, swipe down, Back, Escape. Desktop centring is S-10's.

**S-8 Riddle sheet.** L-2 overlay from the bottom, keyboard-safe (`visualViewport`),
Enter submits. `font-display` prompt; input; "Check answer" (T-4); "N guesses so far ·
hint after 3"; shake 240ms (M-3 flash); cooldown copy. Solved → "The card is somewhere
in <region>." + "Start hunting" (turns radar on). On-site questions are NOT here (S-4 ③).
- Guess count is client-side per card for the session (the API sends none); a server hint
  replaces "· hint after 3" with "Hint · …". Wrong: "Not quite · N guesses so far".
- Cooldown (TOO_MANY_GUESSES): 60 min client guess, "Try again in an hour", button counts
  down m:ss. Network failure: "No connection — try again"; other codes show the server's
  sentence.
- Solved with no region: "The card is somewhere on Vieques." Row "Start hunting and your
  radar will find it" (lucide `Radar`); footnote "Solving shows the region, not the spot".

**S-9 Entry points.** Menu: first Row of the first Group, lucide `GalleryVerticalEnd`,
"Collection", count right (L-6). Profile: "Your collection" section — count + rarest
(opens Collection), leaderboard name, "Show me on Top Traveler" switch. Name + switch
shown when `leaderboard: true` (as the Top Traveler tab).
- Leaderboard name: inline edit (input, maxLength 24, placeholder = default name; lucide
  `Check` / `X`; Enter saves, Escape cancels; empty → back to default). Helper "Shown on
  Top Traveler. Leave empty to use your first name and last initial."; a 400 shows the
  server's sentence; other failures "Couldn't save — try again." (`text-destructive`).
  Server rules: 2–24 chars, whitespace collapsed, no control/format chars, no "@"; default
  = first name + last initial, else "Traveler".
- "Show me on Top Traveler": optimistic switch, disabled while saving, reverts silently
  on failure.

**S-10 Desktop / tablet.** Collection = floating panel (344px, Saved's slot; 3-column
grid); radar button in the control stack; radar pill top-left of the map band (right of
the left panel at its top edge, below the edge tab when folded); banner bottom-left of the
map band, 360px, above the attribution strip; overlays centred with scrim. Inherited
641–1024px tablet gap (PLATFORM.md §6.5) — don't make it worse.
- **Layout is by width; collecting is by touch** (owner, 2026-11-20). ≥641px places the
  pill and banner in the map band. Whether you can collect is `(pointer: coarse)`:
  tablets get the full S-4 body (PixelCard "Something's here…", "within 200 m · walk
  closer", HoldButton, on-site input).
  Collecting is never decided by width; a fine-pointer browser under 641px gets the phone
  layout with the desktop sentence. ClaimReveal centres at ≥641px whatever the pointer.
- Fine pointer (laptop/desktop) banner: thumb, micro-label, name hidden until in range,
  and "Cards are collected on your phone, on the island." in place of the collect action.
  The slim line (L-4, place open) shows "Card nearby · <name>" on every device, as on
  the phone. Locked → "A <pass> pass unlocks <rarity> cards." + See passes; "Upgrade now
  and collect it while you're here." is appended only when you can collect. Sold out
  unchanged on every device.
- Band layout + coarse pointer (tablet): the banner rises with the keyboard
  (`visualViewport`, as S-8) so the on-site input stays visible. When the band is under
  240px (a place or the AI pane open) the banner steps aside (L-4), so a tablet collects
  after closing that panel.

**S-11 Card face generator.** Canvas 630×880 drawn after `document.fonts.ready` (not SVG
in `<img>` — no web fonts there) → `toBlob` → blob URL cached per card + serial. Front:
12px rarity rim, radius 44; header Geist Mono 22px (rarity · region); art window
x36 y84 558×470 r20 (engraving duotone); name Instrument Serif 64px; lore Geist 24px one
line; footer Geist Mono 26px serial + lucide tag glyphs. Back: island outline +
find-spot dot, date, badges. Undiscovered: shared back (contour lines + "?" +
"Explore Vieques"). Used by HoloCard `image`, TiltedCard `imageSrc`, pin art crop, Share.

---

## Build order

1 foundations (tokens, `lib/rarity.ts`, S-11) · 2 vendor (C) · 3 S-1/S-2 + `useCardRadar`
· 4 S-3 · 5 S-4 · 6 S-5 · 7 S-6 Cards/Badges + S-9 · 8 S-7/S-8 · 9 Top Traveler · 10 S-10
· 11 launch: `CARDS_LIVE = true` + terms bump.

## Testing

Throwaway preview page at 390×844 (+320, 430), desktop 1440, `--sab:34px`; Playwright
`setGeolocation` at a test card (scan → reveal → hold → reveal → collection); spoof iOS
UA for the glass fallback; `npx tsc -p tsconfig.app.json --noEmit`, eslint on changed
files, `npm run build`.
