import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'

import { LANDING_URL, type Card, type CardClaim, type CardPosition } from '../../lib/api'
import { inCollectRange } from '../../lib/cardRange'
import { TIER_LABELS } from '../../lib/entitlement'
import { RARITY, rarityColor, silhouetteTitle } from '../../lib/rarity'
import { playSound } from '../../lib/sound'
import { CARDS_FLOAT_GAP, NEARBY_BANNER_GUTTER } from '../../hooks/useMapInsets'
import ClickSpark, { type ClickSparkHandle } from '../reactbits/ClickSpark'
import HoldButton from '../reactbits/HoldButton'
import PixelCard from '../reactbits/PixelCard'
import { failureCopy, formatCountdown, useCardClaim } from './useCardClaim'

/**
 * Vieques Cards nearby banner (docs/CARD_UI_SPEC.md S-4, R-2, L-1, L-3, L-4,
 * G-1, M-2, M-3). Lazy-loaded by MapView (C-3), mounted only while the radar
 * is on and a revealed card you don't own is within reveal range.
 *
 * States: ① revealed (walk closer, PixelCard + SoundReveal) · ② in range
 * (HoldButton → ClickSpark → claim) · ③ on-site question: the prompt and
 * "Answer to collect", which opens the answer sheet (S-4a) — no input here
 * (owner, 2026-11-20: the keyboard covered it) · ④ locked upsell.
 * Every server "no" maps to the S-4 copy plus a next step (R-2); the claim
 * call and its error handling are shared with the answer sheet (useCardClaim).
 *
 * Which card it shows is MapView's ("Choosing a card", S-4): the one you
 * picked, else the nearest collectable card in range; with 2+ in range the
 * banner shows "‹ 1 of N ›" to switch. The thumbnail opens the card (S-7).
 *
 * "In range" here is only a UI hint mirroring the server's own test
 * (radius + min(accuracy, 25 m)); the server decides. There is deliberately no
 * client island fence — testers skip it on the server.
 *
 * The success moment (S-5) is NOT here: a successful claim calls `onClaimed`,
 * and MapView opens the full-screen claim reveal (ClaimReveal).
 */

/** S-4 ②: hold for one second; it drains back on early release. */
const HOLD_MS = 1000
const RELEASE_MS = 200

/** Cards that already played their one SoundReveal this session (M-4). */
const soundedReveal = new Set<string>()

function article(word: string): 'A' | 'An' {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

/** A token's value, for the canvas components (`var()` means nothing on a canvas). */
function cssValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** "‹ 1 of 3 ›": this card's place among the collectable cards in range. */
export type BannerSwitch = { index: number; count: number; onPrev: () => void; onNext: () => void }

export type NearbyBannerProps = {
  card: Card
  /** Latest fix from MapView's location watch. */
  fix: CardPosition | null
  /** L-4: a place is open → one slim line. */
  slim: boolean
  /** L-4: sheet at full / z-70 overlay open. */
  hidden: boolean
  /** Successful (or idempotent alreadyOwned) claim. */
  onClaimed: (card: Card, claim: CardClaim) => void
  /** RIDDLE_UNSOLVED → open the riddle (S-8, step 8). */
  onSolveRiddle: (card: Card) => void
  /** ③ "Answer to collect" (or ANSWER_REQUIRED on a hold) → the answer sheet (S-4a). */
  onAnswer: (card: Card) => void
  /** The thumbnail → card detail (S-7). */
  onOpenCard: (card: Card) => void
  /** SOLD_OUT → "See other cards nearby": skip this card. */
  onDismiss: (slug: string) => void
  /** "‹ 1 of N ›" when 2+ collectable cards are in range (S-4 "Choosing a card"). */
  switcher: BannerSwitch | null
  /** M-2: measured height in px, 0 while hidden or unmounted. */
  onHeight: (px: number) => void
  /** Desktop / tablet layout (S-10, ≥641px): bottom-left of the map band.
   *  Omitted on a phone, where the banner sits on the sheet edge (L-3). */
  desktopAt?: NearbyBannerDesktop
  /** Touch device (coarse pointer — phones and tablets): the full collect
   *  flow. False on a laptop/desktop: the banner says where cards are
   *  collected instead (S-10, owner 2026-11-20: touch decides, not width). */
  canCollect: boolean
}

/** S-10 placement: px from the left and bottom of the viewport, and the width. */
export type NearbyBannerDesktop = { left: number; bottom: number; width: number }

/** S-10: desktop has no GPS worth hunting with. */
const DESKTOP_COPY = 'Cards are collected on your phone, on the island.'

export default function NearbyBanner({
  card,
  fix,
  slim,
  hidden,
  onClaimed,
  onSolveRiddle,
  onAnswer,
  onOpenCard,
  onDismiss,
  switcher,
  onHeight,
  desktopAt,
  canCollect,
}: NearbyBannerProps) {
  const boxRef = useRef<HTMLDivElement>(null)

  // M-2: report the live height (it changes with the state) for the camera
  // inset, the radar pill and the control stack (L-3).
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const report = () => onHeight(hidden ? 0 : Math.round(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hidden, onHeight])
  useEffect(() => () => onHeight(0), [onHeight])

  return (
    <div
      // L-1: fixed, z-30, pointer-events-auto (vaul sets pointer-events:none
      // on <body>). L-3: directly on the sheet's live top edge.
      className="pointer-events-auto fixed z-30"
      style={{
        ...(desktopAt
          ? // S-10: bottom-left of the map, above the attribution strip.
            { left: desktopAt.left, bottom: desktopAt.bottom, width: desktopAt.width }
          : {
              left: NEARBY_BANNER_GUTTER,
              right: NEARBY_BANNER_GUTTER,
              bottom: `calc(100dvh - var(--controls-y, calc(100dvh - 176px)) + ${CARDS_FLOAT_GAP}px)`,
            }),
        visibility: hidden ? 'hidden' : 'visible',
      }}
      aria-hidden={hidden || undefined}
    >
      <div
        ref={boxRef}
        className="vq-cards-banner rounded-3xl"
        // Faded on the frosted element itself, never on an ancestor (an
        // ancestor's opacity would turn the backdrop blur off mid-fade).
        style={{ opacity: hidden ? 0 : 'calc(1 - var(--sheet-full, 0) * 2)' }}
      >
        {slim ? (
          <SlimLine card={card} />
        ) : (
          <BannerBody
            // One card's state (errors, cooldown) never leaks into the next.
            key={card.slug}
            card={card}
            fix={fix}
            canCollect={canCollect}
            switcher={switcher}
            onClaimed={onClaimed}
            onSolveRiddle={onSolveRiddle}
            onAnswer={onAnswer}
            onOpenCard={onOpenCard}
            onDismiss={onDismiss}
          />
        )}
      </div>
    </div>
  )
}

/** L-4: a place is open — one line, the banner steps out of the way. */
function SlimLine({ card }: { card: Card }) {
  return (
    <p role="status" className="flex h-10 items-center gap-2 px-4 text-[13px] font-semibold text-foreground">
      <span
        aria-hidden="true"
        className="h-3.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px]"
        style={{ borderColor: rarityColor(card.rarity) }}
      />
      <span className="min-w-0 truncate">
        Card nearby
        {/* P-6: the face (name) only once collected — the banner never has one. */}
        <span className="font-medium text-muted-foreground"> · {RARITY[card.rarity].label.toLowerCase()}</span>
      </span>
    </p>
  )
}

type BodyProps = Pick<
  NearbyBannerProps,
  'card' | 'fix' | 'onClaimed' | 'onSolveRiddle' | 'onAnswer' | 'onOpenCard' | 'onDismiss' | 'switcher'
> & { canCollect: boolean }

function BannerBody({
  card,
  fix,
  canCollect,
  switcher,
  onClaimed,
  onSolveRiddle,
  onAnswer,
  onOpenCard,
  onDismiss,
}: BodyProps) {
  const style = RARITY[card.rarity]
  const [needsAnswer, setNeedsAnswer] = useState(card.challenge?.kind === 'on_site')
  const sparkRef = useRef<ClickSparkHandle>(null)

  const claim = useCardClaim({
    card,
    fix,
    onClaimed,
    // The catalog didn't flag the question — ③ from now on, and ask it (S-4a).
    onAnswerRequired: () => {
      setNeedsAnswer(true)
      onAnswer(card)
    },
  })

  // The canvas components need real colour values (T-1: still the tokens).
  const colors = useMemo(
    () => ({
      rarity: cssValue(style.cssVar),
      primary: cssValue('--primary'),
      sky: cssValue('--accent-sky'),
      fg: cssValue('--foreground'),
    }),
    [style.cssVar],
  )

  // Thumbnail art: the shared "not yet found" back in the rarity rim, in
  // every state — a card's face is first seen in the claim reveal (P-6).
  const [backUrl, setBackUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void import('../../lib/cardFace').then((m) =>
      m
        .unfoundBackUrl()
        .then((url) => alive && setBackUrl(url))
        .catch(() => undefined),
    )
    return () => {
      alive = false
    }
  }, [])

  // ① "Something's here…" plays SoundReveal once per card (S-4, M-4).
  useEffect(() => {
    if (soundedReveal.has(card.slug)) return
    soundedReveal.add(card.slug)
    playSound('reveal')
  }, [card.slug])

  const inRange = inCollectRange(card, fix)

  const onHold = () => {
    if (!prefersReducedMotion()) sparkRef.current?.spark() // M-3: no sparks
    if (fix) claim.submit(fix)
  }

  const thumb = (url: string | null, locked = false) => (
    <ThumbButton card={card} onOpen={() => onOpenCard(card)}>
      <Thumb url={url} card={card} locked={locked} />
    </ThumbButton>
  )
  const switchControls = canCollect && switcher ? <Switcher {...switcher} /> : null

  // --- Views -----------------------------------------------------------------

  if (claim.lockedTier) {
    // ④ ResultsList-style inline upsell.
    const pass = TIER_LABELS[claim.lockedTier] ?? claim.lockedTier
    return (
      <div className="p-3">
        <div className="flex items-center gap-3">
          {thumb(null, true)}
          <div className="min-w-0 flex-1">
            <MicroLabel card={card} suffix="Locked" />
            <p className="truncate font-display text-[20px] leading-tight text-foreground">{silhouetteTitle(card.rarity)}</p>
          </div>
        </div>
        <div className="mt-2.5 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-sm text-foreground">
          <p>
            {article(pass)} {pass} pass unlocks {style.label.toLowerCase()} cards.
            {/* Only where collecting happens (S-7's copy otherwise). */}
            {canCollect && " Upgrade now and collect it while you're here."}
          </p>
          <a
            href={`${LANDING_URL}/pricing`}
            className="mt-2.5 grid h-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
          >
            See passes
          </a>
        </div>
      </div>
    )
  }

  if (claim.soldOut) {
    return (
      <div className="flex items-center gap-3 p-3">
        {thumb(backUrl)}
        <div className="min-w-0 flex-1">
          <MicroLabel card={card} />
          <p className="truncate font-display text-[20px] leading-tight text-foreground">{silhouetteTitle(card.rarity)}</p>
          <p role="status" className="mt-0.5 text-[13px] text-muted-foreground">
            Every copy has been collected
          </p>
          <button
            type="button"
            onClick={() => onDismiss(card.slug)}
            className="-ml-1 mt-0.5 flex h-8 items-center gap-0.5 rounded-full px-1 text-[13px] font-semibold text-primary active:bg-white/12"
          >
            See other cards nearby
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        {switchControls}
      </div>
    )
  }

  if (!canCollect) {
    // S-10: no Hold to collect (and no on-site question) without touch — the
    // same card line as ① / ②, then where collecting happens. The name only
    // shows in range, as on the phone. Sold-out above is unchanged; locked
    // drops its "collect it while you're here" line.
    return (
      <div className="flex items-center gap-3 p-3">
        {inRange ? thumb(backUrl) : <Thumb url={backUrl} card={card} />}
        <div className="min-w-0 flex-1">
          {inRange ? <MicroLabel card={card} suffix="In range" /> : <MicroLabel card={card} suffix="card" sep=" " />}
          <p className="truncate font-display text-[20px] leading-tight text-foreground">
            {inRange ? silhouetteTitle(card.rarity) : "Something's here…"}
          </p>
          <p role="status" className="mt-0.5 text-[13px] text-muted-foreground">
            {DESKTOP_COPY}
          </p>
        </div>
      </div>
    )
  }

  if (!inRange) {
    // ① Revealed, not yet in range: the card back materialises once. Not a
    // button — the name stays a surprise until you're there (the pin opens it).
    return (
      <div className="flex items-center gap-3 p-3">
        <PixelCard
          // Call-site tuning (C-2): a 40×56 card thumbnail, rarity pixels
          // over the shared card back, one intro (M-4; off with reduced motion).
          colors={[colors.rarity, colors.primary, colors.fg]}
          gap={4}
          pixelSize={2}
          speed={30}
          revealDuration={700}
          glow={0.35}
          glowColor={colors.rarity}
          radius={6}
          noFocus
          className="shrink-0"
          style={{
            width: 40,
            height: 56,
            boxShadow: 'none',
            border: `1.5px solid ${rarityColor(card.rarity)}`,
            background: backUrl ? `center / cover no-repeat url(${backUrl})` : undefined,
          }}
        />
        <div className="min-w-0 flex-1">
          <MicroLabel card={card} suffix="card" sep=" " />
          <p className="font-display text-[20px] leading-tight text-foreground">Something's here…</p>
          <p role="status" className="mt-0.5 text-[13px] text-muted-foreground">
            within 200 m · walk closer
          </p>
        </div>
      </div>
    )
  }

  // ② in range / ③ on-site question.
  const message = claim.failure
    ? failureCopy(claim.failure, card, claim.distM, 'No connection — hold to try again')
    : null
  const prompt = card.challenge?.prompt ?? null

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        {thumb(backUrl)}
        <div className="min-w-0 flex-1">
          <MicroLabel card={card} suffix={needsAnswer ? 'One question' : 'In range'} />
          {needsAnswer && prompt ? (
            <p className="line-clamp-3 font-display text-[19px] leading-snug text-foreground">{prompt}</p>
          ) : (
            <p className="truncate font-display text-[20px] leading-tight text-foreground">{silhouetteTitle(card.rarity)}</p>
          )}
        </div>
        {switchControls}
      </div>

      {message && (
        <p role="status" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-x-1 text-[13px] text-foreground">
          {message.action ? (
            <button
              type="button"
              onClick={() => onSolveRiddle(card)}
              className="flex items-center gap-0.5 font-semibold text-primary"
            >
              {message.text}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <span>{message.text}</span>
          )}
        </p>
      )}

      {needsAnswer ? (
        // ③ The answer is typed in the answer sheet (S-4a), which rides on the
        // keyboard; submitting it there is the claim.
        <button
          type="button"
          onClick={() => onAnswer(card)}
          disabled={claim.coolingDown}
          className="mt-2.5 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground disabled:opacity-50"
        >
          {claim.coolingDown ? `Try again in ${formatCountdown(claim.remaining)}` : 'Answer to collect'}
        </button>
      ) : (
        <div className="relative mt-2.5">
          <HoldButton
            // Call-site tuning (C-2, T-4): the teal→sky CTA as the fill, 1 s hold
            // that drains on release; the vendored glow can't colour-mix a
            // gradient, so it's off and the focus ring lives in index.css.
            className="vq-hold w-full"
            size="md"
            radius={16}
            holdTime={HOLD_MS}
            releaseTime={RELEASE_MS}
            backgroundColor="color-mix(in oklch, var(--foreground) 10%, transparent)"
            fillColor="linear-gradient(to bottom right, var(--primary), var(--accent-sky))"
            textColor="var(--foreground)"
            fillTextColor="var(--primary-foreground)"
            glow={false}
            resetAfter={1200}
            disabled={claim.busy || claim.coolingDown}
            doneLabel="Collecting…"
            onHold={onHold}
          >
            {claim.coolingDown ? `Try again in ${formatCountdown(claim.remaining)}` : 'Hold to collect'}
          </HoldButton>
          {/* Sparks on a completed hold (S-4 ②), fired by hand: wrapping the
              button would also spark on the press itself. */}
          <ClickSpark
            ref={sparkRef}
            sparkColor={[colors.primary, colors.sky]}
            sparkCount={8}
            sparkRadius={28}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
        </div>
      )}
    </div>
  )
}

/** "‹ 1 of 3 ›" — 44px targets, nearest first (S-4 "Choosing a card"). */
function Switcher({ index, count, onPrev, onNext }: BannerSwitch) {
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous card in range"
        className="grid h-11 w-11 place-items-center rounded-full text-foreground active:bg-white/12"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span aria-live="polite" className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        {index + 1} of {count}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next card in range"
        className="grid h-11 w-11 place-items-center rounded-full text-foreground active:bg-white/12"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

function MicroLabel({ card, suffix, sep = ' · ' }: { card: Card; suffix?: string; sep?: string }) {
  return (
    <p
      className={`font-mono text-[10px] tracking-[0.14em] uppercase ${RARITY[card.rarity].textClass}`}
    >
      {RARITY[card.rarity].label}
      {suffix && (
        <span className="text-muted-foreground">
          {sep}
          {suffix}
        </span>
      )}
    </p>
  )
}

/** The thumbnail as a button: opens the card (S-7). 2px pad → a 44×60 target. */
function ThumbButton({ card, onOpen, children }: { card: Card; onOpen: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${silhouetteTitle(card.rarity).toLowerCase()}`}
      className="-m-0.5 shrink-0 rounded-lg p-0.5 active:bg-white/12"
    >
      {children}
    </button>
  )
}

/** 40×56 card thumbnail in the rarity rim: the generated face, or a lock. */
function Thumb({ url, card, locked = false }: { url: string | null; card: Card; locked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md border-[1.5px] bg-secondary"
      style={{
        borderColor: rarityColor(card.rarity),
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {locked && <Lock size={15} className={RARITY[card.rarity].textClass} />}
    </span>
  )
}
