import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Share } from 'lucide-react'

import type { AchievementSummary, Card, CardClaim } from '../../lib/api'
import { RARITY, rarityColor } from '../../lib/rarity'
import { playSound } from '../../lib/sound'
import BounceCards from '../reactbits/BounceCards'
import ClickSpark, { type ClickSparkHandle } from '../reactbits/ClickSpark'
import Counter from '../reactbits/Counter'
import ElectricBorder from '../reactbits/ElectricBorder'
import HoloCard from '../reactbits/HoloCard'
import ShinyText from '../reactbits/ShinyText'
import StickerPeel from '../reactbits/StickerPeel'

/**
 * Vieques Cards claim reveal (docs/CARD_UI_SPEC.md S-5, L-2, W-1, W-2, M-3,
 * M-4, I-2, T-1…T-4). The full-screen moment after a successful claim.
 * Lazy-loaded by MapView (C-3) and mounted from its `claimMoment`; MapView
 * pauses the radar pill and hides the banner while it's open (W-2, L-4).
 *
 * Fixed timeline (S-5), so it feels the same every time:
 *   t0     overlay fades in (180ms) · ClickSpark (teal, 8) · vibrate(30)
 *   t120   HoloCard rises in (~300 wide, rarity preset) · SoundCoin, or
 *          SoundTreasure + ElectricBorder for a legendary
 *   t600   rarity label (ShinyText, rare+, trigger="view") + name + region
 *   t700   serial rolls up (Counter, duration .7)
 *   t1500  achievement (if any): StickerPeel badge → BounceCards set
 *   rest   Share · Done (also tap outside, swipe down, Escape)
 * Reduced motion (M-3): everything at once, one plain fade; no sparks, foil
 * drift, roll-up or peel. Sound still plays.
 *
 * The claim is already saved when this mounts (MapView marked the card
 * owned) — closing early, at any point, loses nothing.
 */

const T_CARD = 120
const T_LABEL = 600
const T_SERIAL = 700
const T_ACHIEVEMENT = 1500
/** Rest without an achievement: the serial has settled (700 + ~700ms). */
const T_REST = 1500
/** Rest after an achievement: the peel intro (~1.1s) + the fan have played. */
const T_REST_AFTER_ACHIEVEMENT = T_ACHIEVEMENT + 1300
/** Overlay fade in (S-5) and out. */
const FADE_MS = 180
/** Taps and swipes this early are the hold's own finger lifting, not a close. */
const CLOSE_GUARD_MS = 450
/** Swipe-down distance that closes. */
const SWIPE_CLOSE_PX = 90

/** S-5 "~300 wide". Smaller only when the screen can't fit it. */
const CARD_MAX_W = 300
const CARD_MIN_W = 132
/** Vertical gaps around the card inside the stage (mt-3 above, mt-4 below) + slack. */
const CARD_GAPS = 12 + 16 + 8
/** 63:88, the face generator's ratio (S-11). */
const CARD_RATIO = 630 / 880
/** The face is drawn with a 44px radius on 630px (S-11). */
const FACE_RADIUS_RATIO = 44 / 630
/** BounceCards set fan: at most this many faces. */
const SET_MAX = 5

type Phase = 0 | 1 | 2 | 3 | 4 | 5
const P_OPEN = 0
const P_CARD = 1
const P_LABEL = 2
const P_SERIAL = 3
const P_ACHIEVEMENT = 4
const P_REST = 5

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** A token's value, for the canvas/WebGL components (`var()` means nothing there). */
function cssValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/**
 * The cards to fan for an achievement. The claim reply names the badge but
 * not its cards (the rule stays on the server), so this is the collected card
 * plus the other cards you own that share one of its tags — exact for tag
 * rules ("beach x5", the test "x2"), approximate for hand-picked sets.
 */
function achievementSet(card: Card, collection: readonly Card[]): Card[] {
  const tags = new Set(card.tags)
  const others = collection.filter(
    (c) => c.slug !== card.slug && c.owned && c.name && c.tags.some((t) => tags.has(t)),
  )
  // BounceCards stacks later cards on top: the new card goes last.
  return [...others.slice(0, SET_MAX - 1), card]
}

export type ClaimRevealProps = {
  card: Card
  claim: CardClaim
  /** The catalog (MapView's card pins), for the achievement's set fan. */
  collection: readonly Card[]
  onClose: () => void
}

export default function ClaimReveal({ card, claim, collection, onClose }: ClaimRevealProps) {
  const style = RARITY[card.rarity]
  const [reduced] = useState(prefersReducedMotion)
  const name = card.name ?? 'Card'
  const serialNo = claim.serialNo ?? card.serialNo
  const maxClaims = claim.maxClaims ?? card.maxClaims
  const achievements = claim.newAchievements
  const achievement: AchievementSummary | undefined = achievements[0]
  const hasAchievement = achievement != null

  // --- Timeline ---------------------------------------------------------------
  const [phase, setPhase] = useState<Phase>(reduced ? P_REST : P_OPEN)
  const openedAt = useRef(0)
  useEffect(() => {
    openedAt.current = performance.now()
    if (reduced) return
    const steps: [number, Phase][] = [
      [T_CARD, P_CARD],
      [T_LABEL, P_LABEL],
      [T_SERIAL, P_SERIAL],
    ]
    if (hasAchievement) {
      steps.push([T_ACHIEVEMENT, P_ACHIEVEMENT], [T_REST_AFTER_ACHIEVEMENT, P_REST])
    } else {
      steps.push([T_REST, P_REST])
    }
    const timers = steps.map(([ms, p]) => window.setTimeout(() => setPhase(p), ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [reduced, hasAchievement])

  // t0: sparks (not with reduced motion, M-3) + a short buzz where there is
  // one (I-2: iOS has no vibrate, so it's feature-detected and skipped).
  const sparkRef = useRef<ClickSparkHandle>(null)
  useEffect(() => {
    if ('vibrate' in navigator) navigator.vibrate(30)
    if (reduced) return
    const raf = requestAnimationFrame(() => sparkRef.current?.spark())
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  // t120 (or at once with reduced motion — sound is still allowed, M-3).
  // playSound is a no-op until the radar tap unlocked audio (I-1) or when muted.
  useEffect(() => {
    const t = window.setTimeout(() => playSound(style.sound), reduced ? 0 : T_CARD)
    return () => window.clearTimeout(t)
  }, [reduced, style.sound])

  // --- Card face(s) -----------------------------------------------------------
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const [shareFile, setShareFile] = useState<File | null>(null)
  useEffect(() => {
    let alive = true
    void import('../../lib/cardFace')
      .then((m) => m.cardFrontUrl({ ...card, name, serialNo, maxClaims }))
      .then(async (url) => {
        if (!alive) return
        setFaceUrl(url)
        // Built ahead of the tap: iOS only lets navigator.share run inside the
        // tap itself, so there's no time to fetch the image then.
        const blob = await fetch(url).then((r) => r.blob())
        if (alive) setShareFile(new File([blob], `${card.slug}.png`, { type: 'image/png' }))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [card, name, serialNo, maxClaims])

  const set = useMemo(() => achievementSet(card, collection), [card, collection])
  const [setUrls, setSetUrls] = useState<string[]>([])
  const [badgeUrl, setBadgeUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!achievement) return
    let alive = true
    void import('../../lib/cardFace').then((m) => {
      Promise.all(
        set.map((c) =>
          c.slug === card.slug
            ? m.cardFrontUrl({ ...c, name, serialNo, maxClaims })
            : m.cardFrontUrl({ ...c, name: c.name ?? '' }),
        ),
      )
        .then((urls) => alive && setSetUrls(urls))
        .catch(() => undefined)
      // The badge's own art when it loads cross-origin (StickerPeel draws it on
      // WebGL); otherwise the stand-in sticker until badge art exists.
      const fallback = () => m.badgeStickerUrl().then((url) => alive && setBadgeUrl(url))
      const art = achievement.badge
      if (!art) {
        void fallback().catch(() => undefined)
        return
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => alive && setBadgeUrl(art)
      img.onerror = () => void fallback().catch(() => undefined)
      img.src = art
    })
    return () => {
      alive = false
    }
  }, [achievement, set, card.slug, name, serialNo, maxClaims])

  // --- Colours for the canvas/WebGL components (still the tokens, T-1) --------
  const colors = useMemo(
    () => ({
      rarity: cssValue(style.cssVar),
      primary: cssValue('--primary'),
      fg: cssValue('--foreground'),
    }),
    [style.cssVar],
  )

  // --- Card size: ~300 wide, shrinking only to fit -----------------------------
  // The stage holds label + card + text (+ achievement), centred as one group.
  // The card gets whatever height the others leave, so the achievement joining
  // eases the card smaller instead of pushing anything off screen.
  const stageRef = useRef<HTMLDivElement>(null)
  const [aboveEl, setAboveEl] = useState<HTMLElement | null>(null)
  const [belowEl, setBelowEl] = useState<HTMLElement | null>(null)
  const [cardW, setCardW] = useState(CARD_MAX_W)
  /** Short screens (e.g. 320×568 with an achievement): even the smallest card
   *  doesn't leave room, so the stage scrolls instead of clipping. */
  const [tight, setTight] = useState(false)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect()
      const others = (aboveEl?.offsetHeight ?? 0) + (belowEl?.offsetHeight ?? 0)
      const w = Math.min(CARD_MAX_W, width - 48, (height - others - CARD_GAPS) * CARD_RATIO)
      setCardW(Math.max(CARD_MIN_W, Math.floor(w)))
      setTight(height < others + CARD_GAPS + CARD_MIN_W / CARD_RATIO)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    if (aboveEl) ro.observe(aboveEl)
    if (belowEl) ro.observe(belowEl)
    return () => ro.disconnect()
  }, [aboveEl, belowEl])
  const cardRadius = Math.round(cardW * FACE_RADIUS_RATIO)

  // --- Closing: Done · tap outside · swipe down · Escape ----------------------
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const close = useCallback(
    (guarded: boolean) => {
      if (closingRef.current) return
      if (guarded && performance.now() - openedAt.current < CLOSE_GUARD_MS) return
      closingRef.current = true
      setClosing(true)
      // Fade out, then unmount — every WebGL context goes with it (W-2).
      window.setTimeout(onClose, FADE_MS)
    },
    [onClose],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [])

  const drag = useRef<{ id: number; x0: number; y0: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const onPointerDown = (e: ReactPointerEvent) => {
    // The card tilts, the sticker peels and the fan pushes under a finger —
    // those drags are theirs, not a swipe to close.
    if ((e.target as Element).closest('[data-no-swipe], button:not(.vq-reveal__scrim)')) return
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY }
    setDragging(true)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.y0
    if (Math.abs(e.clientX - d.x0) > Math.abs(dy) && dy < 24) return
    setDragY(Math.max(0, dy))
  }
  const onPointerEnd = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (dragY > SWIPE_CLOSE_PX) close(true)
    else setDragY(0)
  }

  // --- Share (S-5: navigator.share with the face image) -----------------------
  const canShare = typeof navigator.share === 'function'
  const serialLabel = serialNo != null ? `#${pad3(serialNo)}` : null
  const share = () => {
    const text = `${name} · ${style.label}${serialLabel ? ` · ${serialLabel}` : ''} · Explore Vieques`
    const data: ShareData = { title: name, text }
    if (shareFile && navigator.canShare?.({ files: [shareFile] })) data.files = [shareFile]
    navigator.share(data).catch(() => undefined) // dismissed share sheet = fine
  }

  // --- Render -----------------------------------------------------------------
  const shown = (p: Phase) => phase >= p
  const enter = reduced ? 'vq-reveal-fade' : 'vq-reveal-in'
  const legendary = style.electricBorder
  // W-1: one "moment" WebGL at a time — a legendary's ElectricBorder hands
  // over to the StickerPeel when an achievement arrives. With reduced motion
  // there's no peel (a static badge), so the border can stay.
  const stacked = hasAchievement && shown(P_ACHIEVEMENT)
  const electric = legendary && (reduced || !stacked)
  const microLabel = claim.alreadyOwned ? 'In your collection' : 'New card'

  const holo = (
    <HoloCard
      // Call-site tuning (C-2): the rarity's foil preset + intensity (T-1 map),
      // the face's own corner radius, a lighter hover lift for a phone.
      image={faceUrl ?? ''}
      alt={`${name}, ${style.label} card${serialLabel ? `, ${serialLabel}` : ''}`}
      preset={style.holo.preset}
      intensity={style.holo.intensity}
      width={cardW}
      radius={cardRadius}
      hoverScale={1.02}
      // M-4: no idle foil drift — the radar sweep is the only loop.
      idle={false}
      className="vq-reveal-holo"
    />
  )

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vq-reveal-name"
      tabIndex={-1}
      // L-2: fixed inset-0 z-[70], the AddToTripSheet slot; pointer-events-auto
      // because vaul sets pointer-events:none on <body>. touch-action none so
      // a downward drag is ours (swipe to close), not a page pan.
      className={`vq-reveal pointer-events-auto fixed inset-0 z-[70] flex justify-center outline-none sm:items-center ${
        closing ? 'vq-reveal--out' : ''
      }`}
      style={{ touchAction: 'none', overflowX: 'clip' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {/* Scrim — tapping it is "tap outside". */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => close(true)}
        className="vq-reveal__scrim absolute inset-0 cursor-default"
        style={{ ['--vq-reveal-glow' as string]: rarityColor(card.rarity) }}
      />

      <div
        className="pointer-events-none relative flex h-full w-full max-w-md flex-col items-center px-6 pt-[calc(var(--sat)+20px)] pb-[calc(var(--sab)+16px)] sm:h-[min(760px,calc(100dvh-48px))]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          opacity: dragY ? Math.max(0.35, 1 - dragY / 360) : undefined,
          transition: dragging ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
        }}
      >
        {/* The stage: label, card, what it is (+ achievement), centred as
            one group. The card sizes itself to the height left over. */}
        <div
          ref={stageRef}
          className="flex min-h-0 w-full flex-1 flex-col items-center"
          // `safe center`: when it overflows, the top stays reachable. Pan
          // only while it actually scrolls, so swipe-to-close keeps working.
          style={{
            justifyContent: 'safe center',
            ...(tight && { overflowY: 'auto', touchAction: 'pan-y', pointerEvents: 'auto' }),
          }}
        >
          <p ref={setAboveEl} className="font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
            {microLabel}
          </p>

          <div className="relative mt-3">
            <div
              data-no-swipe
              className={`pointer-events-auto relative ${shown(P_CARD) || reduced ? enter : 'opacity-0'}`}
            >
              {faceUrl ? (
                holo
              ) : (
                // The face is still drawing (fonts + canvas, a few ms): hold
                // its space so nothing jumps when it arrives.
                <div style={{ width: cardW, height: Math.round(cardW / CARD_RATIO) }} />
              )}
              {electric && faceUrl && (
                <ElectricBorder
                  // Call-site tuning (C-2): legendary gold (T-1 token value)
                  // hugging the face's corners. A sibling laid over the card,
                  // not a wrapper, so handing over to the StickerPeel (W-1)
                  // never remounts the HoloCard. Its canvas bleeds ~64px, which
                  // the overlay clips (overflow-x: clip).
                  color={colors.rarity}
                  glowColor={colors.rarity}
                  borderRadius={cardRadius}
                  offset={3}
                  speed={0.8}
                  chaos={0.45}
                  thickness={1.5}
                  interactive={false}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: cardRadius }}
                />
              )}
            </div>
            {/* t0 sparks, fired by hand at the card's centre (S-5: teal, 8);
                outside the card's fade-in so they show before it does. */}
            {!reduced && (
              <ClickSpark
                ref={sparkRef}
                sparkColor={colors.primary}
                sparkCount={8}
                sparkRadius={64}
                sparkSize={14}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              />
            )}
          </div>

          <div ref={setBelowEl} className="flex w-full flex-col items-center">
            {/* What it is — real text, not only baked into the face. Fixed
                heights so nothing jumps as each line arrives. */}
            <div className="pointer-events-auto mt-4 flex w-full flex-col items-center text-center">
              <div className="flex h-4 items-center">
                {shown(P_LABEL) && (
                  <p className={`${enter} font-mono text-[11px] font-semibold tracking-[0.14em] uppercase`}>
                    {card.rarity === 'rare' || card.rarity === 'legendary' ? (
                      <ShinyText
                        // Call-site tuning (C-2): rarity colour with a light
                        // sweep, played once on first sight (S-5 trigger="view").
                        text={style.label}
                        color={colors.rarity}
                        shineColor={colors.fg}
                        trigger="view"
                        speed={1.4}
                      />
                    ) : (
                      <span className={style.textClass}>{style.label}</span>
                    )}
                    {card.region && <span className="text-muted-foreground"> · {card.region}</span>}
                  </p>
                )}
              </div>
              <div className="mt-1 flex h-9 w-full items-center justify-center">
                {shown(P_LABEL) && (
                  <h2
                    id="vq-reveal-name"
                    className={`${enter} truncate font-display text-[30px] leading-none tracking-tight text-foreground`}
                  >
                    {name}
                  </h2>
                )}
              </div>
              <div className="mt-1 flex h-8 items-center justify-center font-mono">
                {shown(P_SERIAL) && serialNo != null && (
                  <p className={`${enter} flex items-baseline gap-1.5`}>
                    <Counter
                      // S-5: the serial rolls up, duration .7 (static with
                      // reduced motion — Counter honours it itself).
                      value={serialNo}
                      minDigits={3}
                      prefix="#"
                      duration={0.7}
                      fontSize={26}
                      fontWeight={600}
                      textColor="var(--foreground)"
                      className="font-mono"
                    />
                    {maxClaims != null && (
                      <span className="text-[13px] text-muted-foreground">of {pad3(maxClaims)}</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* t1500: achievement unlocked — badge peels on, the set fans out. */}
            {stacked && achievement && (
              <section
                aria-label="Achievement unlocked"
                className={`${enter} pointer-events-auto mt-4 flex w-full flex-col items-center`}
              >
                <p className="font-mono text-[10px] tracking-[0.14em] text-rarity-legendary uppercase">
                  Achievement unlocked
                </p>
                <div className="mt-2 flex w-full items-center justify-center gap-3">
                  <div data-no-swipe className="relative h-[84px] w-[84px] shrink-0">
                    {badgeUrl &&
                      (reduced ? (
                        <img src={badgeUrl} alt="" className="h-full w-full" draggable={false} />
                      ) : (
                        <StickerPeel
                          // Call-site tuning (C-2): badge-sized, no dragging (the
                          // overlay swipes), a gentle tilt as it lands.
                          imageSrc={badgeUrl}
                          width={76}
                          rotate={-6}
                          draggable={false}
                          peelBackHoverPct={18}
                          peelBackActivePct={32}
                          shadowIntensity={0.45}
                        />
                      ))}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="font-display text-[24px] leading-tight text-foreground">{achievement.name}</p>
                    {achievements.length > 1 && (
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        Also: {achievements.slice(1).map((a) => a.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div data-no-swipe className="vq-reveal-fan mt-1 flex justify-center">
                  {setUrls.length > 0 && (
                    <BounceCards
                      // Call-site tuning (C-2): small portrait faces (aspect set
                      // in index.css), no white frame — the faces have their rim.
                      images={setUrls.map((src, i) => ({ src, alt: set[i]?.name ?? '' }))}
                      containerWidth={280}
                      containerHeight={104}
                      cardSize={58}
                      spread={setUrls.length > 3 ? 40 : 52}
                      rotation={9}
                      animationDelay={0.45}
                      pushDistance={36}
                      borderWidth={0}
                      borderColor="transparent"
                      radius={5}
                    />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Rest: Share · Done. */}
        <div
          className={`pointer-events-auto mt-4 flex w-full gap-2.5 ${shown(P_REST) ? enter : 'invisible'}`}
          aria-hidden={!shown(P_REST) || undefined}
        >
          {canShare && (
            <button
              type="button"
              onClick={share}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 font-semibold text-foreground active:bg-white/12"
            >
              <Share size={17} aria-hidden="true" />
              Share
            </button>
          )}
          <button
            type="button"
            onClick={() => close(false)}
            className="h-12 flex-1 rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
