import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Lock } from 'lucide-react'

import {
  ApiError,
  cardErrorDetail,
  claimCard,
  LANDING_URL,
  type Card,
  type CardClaim,
  type CardErrorCode,
  type CardPosition,
  type CardWarmth,
  type Tier,
} from '../../lib/api'
import { TIER_LABELS } from '../../lib/entitlement'
import { milesBetween } from '../../lib/geo'
import { RARITY, rarityColor } from '../../lib/rarity'
import { playSound } from '../../lib/sound'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { useOutsideSheetFocus } from '../../hooks/useOutsideSheetFocus'
import { CARDS_FLOAT_GAP, NEARBY_BANNER_GUTTER } from '../../hooks/useMapInsets'
import ClickSpark, { type ClickSparkHandle } from '../reactbits/ClickSpark'
import HoldButton from '../reactbits/HoldButton'
import PixelCard from '../reactbits/PixelCard'

/**
 * Vieques Cards nearby banner (docs/CARD_UI_SPEC.md S-4, R-2, L-1, L-3, L-4,
 * G-1, M-2, M-3). Lazy-loaded by MapView (C-3), mounted only while the radar
 * is on and a revealed card you don't own is within reveal range.
 *
 * States: ① revealed (walk closer, PixelCard + SoundReveal) · ② in range
 * (HoldButton → ClickSpark → claim) · ③ on-site question · ④ locked upsell.
 * Every server "no" maps to the S-4 copy plus a next step (R-2).
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
/** Mirrors backend/cards.js — the client's "in range" hint uses the same rule. */
const CLAIM_MAX_ACCURACY_M = 50
const CLAIM_ACCURACY_SLACK_M = 25
/** The server sends no retry time for these, so the countdown is a client
 *  guess (owner can tune): TOO_FAST a few minutes, TOO_MANY_GUESSES an hour. */
const TOO_FAST_COOLDOWN_MS = 3 * 60_000
const TOO_MANY_GUESSES_COOLDOWN_MS = 60 * 60_000

const METRES_PER_MILE = 1609.344

/** Per-card cooldowns, for this session (survive the banner remounting). */
const cooldowns = new Map<string, number>()
/** Cards that already played their one SoundReveal this session (M-4). */
const soundedReveal = new Set<string>()

function metresTo(fix: CardPosition, center: [number, number]): number {
  return milesBetween([fix.lng, fix.lat], center) * METRES_PER_MILE
}

/** "7 pm–midnight" from Puerto Rico hours [from, to). */
function formatHours([from, to]: [number, number]): string {
  const h = (n: number) => {
    const x = ((n % 24) + 24) % 24
    if (x === 0) return 'midnight'
    if (x === 12) return 'noon'
    return x < 12 ? `${x} am` : `${x - 12} pm`
  }
  return `${h(from)}–${h(to)}`
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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

type Failure = {
  code: CardErrorCode | 'NETWORK' | undefined
  distanceM: number | null
  warmth: CardWarmth | null
  /** The server's own sentence, for codes S-4 has no copy for. */
  message: string
  /** Client distance to the card when the server answered (TOO_FAR live count). */
  distAtFailure: number | null
}

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
  /** SOLD_OUT → "See other cards nearby": skip this card. */
  onDismiss: (slug: string) => void
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
  onDismiss,
  onHeight,
  desktopAt,
  canCollect,
}: NearbyBannerProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  // A tablet answering an on-site question in the band-placed banner: ride on
  // top of the on-screen keyboard (iOS doesn't shrink the layout viewport).
  const keyboard = useKeyboardInset(desktopAt != null && canCollect)
  // The on-site answer field sits outside the (secretly modal) map sheet.
  useOutsideSheetFocus(boxRef)

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
            { left: desktopAt.left, bottom: desktopAt.bottom + keyboard, width: desktopAt.width }
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
            // One card's state (answer, errors, cooldown) never leaks into the next.
            key={card.slug}
            card={card}
            fix={fix}
            canCollect={canCollect}
            onClaimed={onClaimed}
            onSolveRiddle={onSolveRiddle}
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
        {card.name && <span className="font-medium text-muted-foreground"> · {card.name}</span>}
      </span>
    </p>
  )
}

type BodyProps = Pick<
  NearbyBannerProps,
  'card' | 'fix' | 'onClaimed' | 'onSolveRiddle' | 'onDismiss'
> & { canCollect: boolean }

function BannerBody({ card, fix, canCollect, onClaimed, onSolveRiddle, onDismiss }: BodyProps) {
  const style = RARITY[card.rarity]
  const [answer, setAnswer] = useState('')
  const [needsAnswer, setNeedsAnswer] = useState(card.challenge?.kind === 'on_site')
  const [lockedTier, setLockedTier] = useState<Tier | null>(card.lockedByTier ? card.minTier : null)
  const [soldOut, setSoldOut] = useState(card.soldOut)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [hint, setHint] = useState<string | null>(card.challenge?.hint ?? null)
  const [busy, setBusy] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(() => cooldowns.get(card.slug) ?? 0)
  const [now, setNow] = useState(() => Date.now())

  const busyRef = useRef(false)
  /** LOW_ACCURACY: try again by itself on the next fix that's good enough. */
  const retryOnFixRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const sparkRef = useRef<ClickSparkHandle>(null)

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

  // Card art for the thumbnail: the shared "not yet found" back while you
  // walk up (①), the generated front once you're in range (②/③).
  const [backUrl, setBackUrl] = useState<string | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const name = card.name
    void import('../../lib/cardFace').then((m) => {
      m.unfoundBackUrl()
        .then((url) => alive && setBackUrl(url))
        .catch(() => undefined)
      if (name) {
        m.cardFrontUrl({ ...card, name })
          .then((url) => alive && setFrontUrl(url))
          .catch(() => undefined)
      }
    })
    return () => {
      alive = false
    }
  }, [card])

  // ① "Something's here…" plays SoundReveal once per card (S-4, M-4).
  useEffect(() => {
    if (soundedReveal.has(card.slug)) return
    soundedReveal.add(card.slug)
    playSound('reveal')
  }, [card.slug])

  // Countdown for TOO_FAST / TOO_MANY_GUESSES (R-2 "Countdown").
  const coolingDown = cooldownUntil > now
  useEffect(() => {
    if (!coolingDown) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [coolingDown])

  const distM = fix && card.location ? metresTo(fix, card.location.center) : null
  const inRange =
    fix != null &&
    distM != null &&
    card.location != null &&
    distM <= card.location.radiusM + Math.min(fix.accuracy, CLAIM_ACCURACY_SLACK_M)

  const startCooldown = (ms: number) => {
    const until = Date.now() + ms
    cooldowns.set(card.slug, until)
    setNow(Date.now())
    setCooldownUntil(until)
  }

  // Wrong answer → shake (M-3: a border flash with reduced motion). Applied
  // after React commits, so the re-render that adds the red border can't
  // overwrite the class; the counter restarts it on a repeat miss.
  const [shakes, setShakes] = useState(0)
  useEffect(() => {
    const el = inputRef.current
    if (!shakes || !el) return
    el.classList.remove('vq-shake')
    void el.offsetWidth
    el.classList.add('vq-shake')
  }, [shakes])
  const shake = () => setShakes((n) => n + 1)

  const fail = (e: unknown) => {
    if (!(e instanceof ApiError)) {
      setFailure({ code: 'NETWORK', distanceM: null, warmth: null, message: '', distAtFailure: null })
      return
    }
    const d = cardErrorDetail(e)
    const base: Failure = {
      code: d.code,
      distanceM: d.distanceM,
      warmth: d.warmth,
      message: e.message,
      distAtFailure: distM,
    }
    switch (d.code) {
      case 'UPGRADE_REQUIRED':
        setFailure(null)
        setLockedTier(d.minTier ?? card.minTier)
        return
      case 'SOLD_OUT':
        setFailure(null)
        setSoldOut(true)
        return
      case 'ANSWER_REQUIRED':
        // The catalog didn't flag the question — ask it now (③).
        setFailure(null)
        setNeedsAnswer(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
        return
      case 'WRONG_ANSWER':
        if (d.hint) setHint(d.hint)
        setFailure(base)
        shake()
        return
      case 'LOW_ACCURACY':
        retryOnFixRef.current = true
        setFailure(base)
        return
      case 'TOO_FAST':
        startCooldown(TOO_FAST_COOLDOWN_MS)
        setFailure(base)
        return
      case 'TOO_MANY_GUESSES':
        startCooldown(TOO_MANY_GUESSES_COOLDOWN_MS)
        setFailure(base)
        return
      default:
        setFailure(base)
    }
  }

  const submit = (pos: CardPosition) => {
    // A double hold / auto-retry race sends one request; the server is
    // idempotent anyway (a second claim returns the same serial).
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    claimCard(card.slug, pos, needsAnswer ? answer.trim() : undefined)
      .then((res) => {
        setFailure(null)
        onClaimed(card, res)
      })
      .catch(fail)
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }

  // LOW_ACCURACY auto-retry: the next fix inside the server's accuracy limit.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  useEffect(() => {
    if (!retryOnFixRef.current || !fix || fix.accuracy > CLAIM_MAX_ACCURACY_M) return
    retryOnFixRef.current = false
    submitRef.current(fix)
  }, [fix])

  const onHold = () => {
    if (!prefersReducedMotion()) sparkRef.current?.spark() // M-3: no sparks
    if (fix) submit(fix)
  }

  // --- Views -----------------------------------------------------------------

  if (lockedTier) {
    // ④ ResultsList-style inline upsell.
    const pass = TIER_LABELS[lockedTier] ?? lockedTier
    return (
      <div className="p-3">
        <div className="flex items-center gap-3">
          <Thumb url={null} card={card} locked />
          <div className="min-w-0 flex-1">
            <MicroLabel card={card} suffix="Locked" />
            <p className="truncate font-display text-[20px] leading-tight text-foreground">{card.name}</p>
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

  if (soldOut) {
    return (
      <div className="flex items-center gap-3 p-3">
        <Thumb url={frontUrl} card={card} />
        <div className="min-w-0 flex-1">
          <MicroLabel card={card} />
          <p className="truncate font-display text-[20px] leading-tight text-foreground">{card.name}</p>
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
        <Thumb url={inRange ? frontUrl : backUrl} card={card} />
        <div className="min-w-0 flex-1">
          {inRange ? <MicroLabel card={card} suffix="In range" /> : <MicroLabel card={card} suffix="card" sep=" " />}
          <p className="truncate font-display text-[20px] leading-tight text-foreground">
            {inRange ? card.name : "Something's here…"}
          </p>
          <p role="status" className="mt-0.5 text-[13px] text-muted-foreground">
            {DESKTOP_COPY}
          </p>
        </div>
      </div>
    )
  }

  if (!inRange) {
    // ① Revealed, not yet in range: the card back materialises once.
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
  const remaining = cooldownUntil - now
  const holdDisabled = busy || coolingDown || (needsAnswer && answer.trim() === '')
  const message = failure ? failureCopy(failure, card, distM) : null

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        <Thumb url={frontUrl} card={card} />
        <div className="min-w-0 flex-1">
          <MicroLabel card={card} suffix={needsAnswer ? 'One question' : 'In range'} />
          {needsAnswer && card.challenge?.prompt ? (
            <p className="font-display text-[19px] leading-snug text-foreground">{card.challenge.prompt}</p>
          ) : (
            <p className="truncate font-display text-[20px] leading-tight text-foreground">{card.name}</p>
          )}
        </div>
      </div>

      {needsAnswer && (
        <input
          ref={inputRef}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value)
            if (failure?.code === 'WRONG_ANSWER') setFailure(null)
          }}
          onAnimationEnd={(e) => e.currentTarget.classList.remove('vq-shake')}
          placeholder="Type your answer"
          aria-label={card.challenge?.prompt ?? 'Answer'}
          aria-invalid={failure?.code === 'WRONG_ANSWER' || undefined}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          className={`mt-2.5 h-11 w-full rounded-xl border bg-white/6 px-3.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none ${
            failure?.code === 'WRONG_ANSWER' ? 'border-destructive/70' : 'border-white/12'
          }`}
        />
      )}

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
      {needsAnswer && hint && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">Hint</span> · {hint}
        </p>
      )}

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
          disabled={holdDisabled}
          doneLabel="Collecting…"
          onHold={onHold}
        >
          {coolingDown ? `Try again in ${formatCountdown(remaining)}` : 'Hold to collect'}
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
    </div>
  )
}

/** S-4 / R-2 copy for each server "no", with its next step. */
function failureCopy(
  f: Failure,
  card: Card,
  distM: number | null,
): { text: string; action?: 'riddle' } {
  switch (f.code) {
    case 'TOO_FAR': {
      if (f.warmth) return { text: `Not here — keep searching · ${f.warmth}` }
      // R-2 "live distance": the server's metres-to-go, minus however far
      // you've walked toward the card since (your fix vs the located card).
      const walked = f.distAtFailure != null && distM != null ? f.distAtFailure - distM : 0
      const n = Math.max(1, Math.round((f.distanceM ?? 1) - walked))
      return { text: `Get a little closer · ${n} m to go` }
    }
    case 'LOW_ACCURACY':
      return { text: 'Your GPS is fuzzy — step into the open' }
    case 'NOT_NOW':
      return {
        text: card.activeHours ? `This card appears ${formatHours(card.activeHours)}` : f.message,
      }
    case 'TOO_FAST':
      return { text: 'Whoa, that was fast. Try again in a few minutes' }
    case 'TOO_MANY_GUESSES':
      return { text: 'Try again in an hour' }
    case 'RIDDLE_UNSOLVED':
      return { text: 'Solve the riddle first', action: 'riddle' }
    case 'WRONG_ANSWER':
      return { text: 'Not quite — look around' }
    case 'NOT_ON_ISLAND':
      // S-2's off-island copy (S-4 has none of its own).
      return { text: 'Cards live on Vieques' }
    case 'NETWORK':
      return { text: 'No connection — hold to try again' }
    default:
      // NOT_FOUND, NO_LOCATION…: the server's own sentence.
      return { text: f.message }
  }
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
