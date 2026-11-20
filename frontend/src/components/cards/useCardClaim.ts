import { useEffect, useRef, useState, type RefObject } from 'react'

import {
  ApiError,
  cardErrorDetail,
  claimCard,
  type Card,
  type CardClaim,
  type CardErrorCode,
  type CardPosition,
  type CardWarmth,
  type Tier,
} from '../../lib/api'
import { CLAIM_MAX_ACCURACY_M, metresTo } from '../../lib/cardRange'

/**
 * The claim call and every S-4 "no" it can come back with, shared by the
 * nearby banner's hold (S-4 ②) and the answer sheet (S-4a), so both handle
 * the same codes, cooldowns and auto-retry (docs/CARD_UI_SPEC.md S-4, R-2).
 * Lives in the lazy Cards chunks (C-3) — only those two import it.
 */

/** The server sends no retry time for these, so the countdown is a client
 *  guess (owner can tune): TOO_FAST a few minutes, TOO_MANY_GUESSES an hour. */
const TOO_FAST_COOLDOWN_MS = 3 * 60_000
const TOO_MANY_GUESSES_COOLDOWN_MS = 60 * 60_000

/** Per-card claim cooldowns, this session — shared by the banner and the
 *  answer sheet, and they survive either remounting. */
const cooldowns = new Map<string, number>()

export type ClaimFailure = {
  code: CardErrorCode | 'NETWORK' | undefined
  distanceM: number | null
  warmth: CardWarmth | null
  /** The server's own sentence, for codes S-4 has no copy for. */
  message: string
  /** Client distance to the card when the server answered (TOO_FAR live count). */
  distAtFailure: number | null
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

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** S-4 / R-2 copy for each server "no", with its next step. `network` is the
 *  surface's own retry wording ("hold to try again" in the banner). */
export function failureCopy(
  f: ClaimFailure,
  card: Card,
  distM: number | null,
  network: string,
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
      return { text: network }
    default:
      // NOT_FOUND, NO_LOCATION…: the server's own sentence.
      return { text: f.message }
  }
}

export type UseCardClaimOptions = {
  card: Card
  /** Latest fix from MapView's location watch. */
  fix: CardPosition | null
  /** Successful (or idempotent alreadyOwned) claim. */
  onClaimed: (card: Card, claim: CardClaim) => void
  /** ANSWER_REQUIRED: the catalog didn't flag the on-site question. */
  onAnswerRequired?: () => void
  /** The input to shake on WRONG_ANSWER (M-3: a border flash with reduced motion). */
  shakeRef?: RefObject<HTMLElement | null>
}

export function useCardClaim({ card, fix, onClaimed, onAnswerRequired, shakeRef }: UseCardClaimOptions) {
  const [lockedTier, setLockedTier] = useState<Tier | null>(card.lockedByTier ? card.minTier : null)
  const [soldOut, setSoldOut] = useState(card.soldOut)
  const [failure, setFailure] = useState<ClaimFailure | null>(null)
  const [hint, setHint] = useState<string | null>(card.challenge?.hint ?? null)
  const [busy, setBusy] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(() => cooldowns.get(card.slug) ?? 0)
  const [now, setNow] = useState(() => Date.now())

  const busyRef = useRef(false)
  /** LOW_ACCURACY: try again by itself on the next fix that's good enough. */
  const retryOnFixRef = useRef(false)
  /** The answer sent with the last claim, so the auto-retry resends it. */
  const answerRef = useRef<string | undefined>(undefined)

  // Countdown for TOO_FAST / TOO_MANY_GUESSES (R-2 "Countdown").
  const coolingDown = cooldownUntil > now
  useEffect(() => {
    if (!coolingDown) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [coolingDown])

  const distM = fix && card.location ? metresTo(fix, card.location.center) : null

  const startCooldown = (ms: number) => {
    const until = Date.now() + ms
    cooldowns.set(card.slug, until)
    setNow(Date.now())
    setCooldownUntil(until)
  }

  // Wrong answer → shake. Applied after React commits, so the re-render that
  // adds the red border can't overwrite the class; the counter restarts it on
  // a repeat miss.
  const [shakes, setShakes] = useState(0)
  useEffect(() => {
    const el = shakeRef?.current
    if (!shakes || !el) return
    el.classList.remove('vq-shake')
    void el.offsetWidth
    el.classList.add('vq-shake')
  }, [shakes, shakeRef])

  const fail = (e: unknown) => {
    if (!(e instanceof ApiError)) {
      setFailure({ code: 'NETWORK', distanceM: null, warmth: null, message: '', distAtFailure: null })
      return
    }
    const d = cardErrorDetail(e)
    const base: ClaimFailure = {
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
        setFailure(null)
        onAnswerRequired?.()
        return
      case 'WRONG_ANSWER':
        if (d.hint) setHint(d.hint)
        setFailure(base)
        setShakes((n) => n + 1)
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

  const submit = (pos: CardPosition, answer?: string) => {
    // A double tap / auto-retry race sends one request; the server is
    // idempotent anyway (a second claim returns the same serial).
    if (busyRef.current) return
    busyRef.current = true
    answerRef.current = answer
    setBusy(true)
    claimCard(card.slug, pos, answer)
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
    submitRef.current(fix, answerRef.current)
  }, [fix])

  /** Typing again clears a "Not quite". */
  const clearWrong = () => {
    if (failure?.code === 'WRONG_ANSWER') setFailure(null)
  }

  return {
    submit,
    busy,
    failure,
    hint,
    lockedTier,
    soldOut,
    coolingDown,
    remaining: cooldownUntil - now,
    distM,
    clearWrong,
  }
}
