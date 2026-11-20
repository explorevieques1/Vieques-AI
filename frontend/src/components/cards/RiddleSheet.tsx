import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Radar, X } from 'lucide-react'

import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { useOutsideSheetFocus } from '../../hooks/useOutsideSheetFocus'
import { armCardRadar } from '../../hooks/useCardRadar'
import { ApiError, cardErrorDetail, solveRiddle, type Card } from '../../lib/api'
import { RARITY } from '../../lib/rarity'

/**
 * Vieques Cards riddle sheet (docs/CARD_UI_SPEC.md S-8, L-2, M-3, T-2…T-4).
 * A locate riddle: solving it tells you the region to search, never the spot
 * (the server sends only `region`). On-site questions are NOT here — they live
 * in the nearby banner (S-4 ③).
 *
 * Opens from the card detail of an unfound card (S-7) and from the banner's
 * RIDDLE_UNSOLVED (S-4). Lazy-loaded by MapView (C-3), which pauses the radar
 * pill while it's open (W-2) and owns the Back-gesture entry.
 *
 *  - Rises from the bottom, keyboard-safe: it sits on top of the on-screen
 *    keyboard (visualViewport, useKeyboardInset). Enter submits.
 *  - "N guesses so far · hint after 3"; the riddle's hint once the server sends
 *    it (after 3 misses). Wrong → 240ms shake (M-3: a border flash).
 *  - TOO_MANY_GUESSES → "Try again in an hour" + a countdown on the button
 *    (the server sends no retry time; same 60-minute guess as S-4).
 *  - Solved → "The card is somewhere in <region>." + "Start hunting" (radar on).
 */

/** S-4's cooldown guess for TOO_MANY_GUESSES (the server sends no retry time). */
const TOO_MANY_GUESSES_COOLDOWN_MS = 60 * 60_000
/** The server shows the riddle's hint after this many misses (HINT_AFTER_MISSES). */
const HINT_AFTER = 3
/** Sheet slide in/out (M-3: a plain fade). */
const SLIDE_MS = 220

/** Wrong guesses this session, per card (the API doesn't send a count). */
const guesses = new Map<string, number>()
/** Per-card cooldowns, this session (survive the sheet closing). */
const cooldowns = new Map<string, number>()

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type RiddleSheetProps = {
  card: Card
  onClose: () => void
  /** The server accepted the answer; `region` is where to search. */
  onSolved: (card: Card, region: string | null) => void
  /** "Start hunting": radar on, back to the map. Called inside the tap (I-1). */
  onStartHunting: () => void
}

export default function RiddleSheet({ card, onClose, onSolved, onStartHunting }: RiddleSheetProps) {
  const style = RARITY[card.rarity]
  const prompt = card.challenge?.prompt ?? ''
  const keyboard = useKeyboardInset()

  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(() => guesses.get(card.slug) ?? 0)
  const [hint, setHint] = useState<string | null>(card.challenge?.hint ?? null)
  const [wrong, setWrong] = useState(false)
  /** A "no" other than a wrong answer: the server's sentence or ours. */
  const [message, setMessage] = useState<string | null>(null)
  const [solved, setSolved] = useState<{ region: string | null } | null>(
    card.challenge?.solved ? { region: card.region } : null,
  )
  const [cooldownUntil, setCooldownUntil] = useState(() => cooldowns.get(card.slug) ?? 0)
  const [now, setNow] = useState(() => Date.now())
  const coolingDown = cooldownUntil > now
  useEffect(() => {
    if (!coolingDown) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [coolingDown])

  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)

  // Wrong answer → shake (reduced motion: border flash, in index.css). Applied
  // after commit so the re-render adding the red border can't drop the class;
  // the counter restarts it on a repeat miss.
  const [shakes, setShakes] = useState(0)
  useEffect(() => {
    const el = inputRef.current
    if (!shakes || !el) return
    el.classList.remove('vq-shake')
    void el.offsetWidth
    el.classList.add('vq-shake')
  }, [shakes])

  // --- Close: ✕ · tap outside · Escape (Back is MapView's) ---------------------
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(onClose, SLIDE_MS)
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const dialogRef = useRef<HTMLDivElement>(null)
  useOutsideSheetFocus(dialogRef) // the riddle input sits outside the map sheet too
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault() // Enter submits the form; the page never reloads
    const text = answer.trim()
    if (!text || busyRef.current || coolingDown || solved) return
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    solveRiddle(card.slug, text)
      .then((res) => {
        setWrong(false)
        setSolved({ region: res.region ?? null })
        inputRef.current?.blur() // the keyboard goes; the answer is in
        onSolved(card, res.region ?? null)
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiError)) {
          setMessage('No connection — try again')
          return
        }
        const d = cardErrorDetail(err)
        switch (d.code) {
          case 'WRONG_ANSWER': {
            const n = (guesses.get(card.slug) ?? 0) + 1
            guesses.set(card.slug, n)
            setCount(n)
            if (d.hint) setHint(d.hint)
            setWrong(true)
            setShakes((k) => k + 1)
            return
          }
          case 'TOO_MANY_GUESSES': {
            const until = Date.now() + TOO_MANY_GUESSES_COOLDOWN_MS
            cooldowns.set(card.slug, until)
            setNow(Date.now())
            setCooldownUntil(until)
            setMessage('Try again in an hour')
            return
          }
          default:
            // NO_CHALLENGE, ON_SITE, a generic 429…: the server's own sentence.
            setMessage(err.message)
        }
      })
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const sheetAnim = closing
    ? reducedMotion
      ? 'vq-riddle--fade-out'
      : 'vq-riddle--out'
    : reducedMotion
      ? 'vq-reveal-fade'
      : 'vq-riddle--in'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vq-riddle-title"
      tabIndex={-1}
      // L-2: fixed inset-0 z-[70], the AddToTripSheet pattern (sheet from the
      // bottom on a phone, centred on desktop); pointer-events-auto because
      // vaul sets pointer-events:none on <body>.
      className="pointer-events-auto fixed inset-0 z-[70] flex items-end justify-center outline-none sm:items-center"
    >
      <button
        type="button"
        aria-label="Close riddle"
        tabIndex={-1}
        onClick={close}
        className={`absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm ${
          closing ? 'vq-riddle--fade-out' : 'vq-reveal-fade'
        }`}
      />

      <div
        // Frosted (G-1: taller than 64px, so not GlassSurface). Keyboard-safe:
        // lifted by the keyboard's height; the home-indicator pad only when
        // there's no keyboard over it.
        className={`vq-cards-sheet relative w-full max-w-md rounded-t-3xl px-4 pt-2 sm:rounded-3xl sm:pb-4 ${sheetAnim}`}
        style={{
          marginBottom: keyboard,
          paddingBottom: keyboard ? 16 : 'calc(1rem + var(--sab))',
        }}
      >
        <div className="flex items-center justify-between">
          <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-white/20 sm:invisible" />
        </div>
        <div className="mt-2 flex items-start gap-3">
          <p className="flex-1 pt-1 font-mono text-[10px] tracking-[0.14em] uppercase">
            {solved ? (
              <span className="text-primary">Solved</span>
            ) : (
              <>
                <span className={style.textClass}>{style.label}</span>
                <span className="text-muted-foreground"> · Riddle</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {solved ? (
          <>
            <h2 id="vq-riddle-title" className="mt-1 font-display text-[24px] leading-snug text-foreground">
              {solved.region ? (
                <>
                  The card is somewhere in <span className="text-primary">{solved.region}</span>.
                </>
              ) : (
                'The card is somewhere on Vieques.'
              )}
            </h2>
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-white/6 px-3.5 py-3 text-[14px] text-foreground">
              <Radar size={16} className="shrink-0 text-primary" aria-hidden="true" />
              Start hunting and your radar will find it
            </p>
            <button
              type="button"
              onClick={() => {
                armCardRadar() // I-1: unlock sound + motion permission inside the tap
                onStartHunting()
              }}
              className="mt-3 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
            >
              Start hunting
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-1">
            <h2 id="vq-riddle-title" className="font-display text-[22px] leading-snug text-foreground">
              {prompt}
            </h2>
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value)
                if (wrong) setWrong(false)
              }}
              onAnimationEnd={(e) => e.currentTarget.classList.remove('vq-shake')}
              placeholder="Your answer"
              aria-label="Your answer"
              aria-invalid={wrong || undefined}
              aria-describedby="vq-riddle-status"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={coolingDown}
              className={`mt-3 h-11 w-full rounded-xl border bg-white/6 px-3.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none disabled:opacity-60 ${
                wrong ? 'border-destructive/70' : 'border-white/12'
              }`}
            />
            <p id="vq-riddle-status" role="status" aria-live="polite" className="mt-2 text-[12px] text-muted-foreground">
              {message ? (
                <span className="text-foreground">{message}</span>
              ) : (
                <>
                  {wrong && <span className="text-foreground">Not quite · </span>}
                  {count} {count === 1 ? 'guess' : 'guesses'} so far
                  {!hint && ` · hint after ${HINT_AFTER}`}
                </>
              )}
            </p>
            {hint && (
              <p className="mt-1 text-[13px] text-foreground">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Hint</span> ·{' '}
                {hint}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || coolingDown || answer.trim() === ''}
              className="mt-3 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground disabled:opacity-50"
            >
              {coolingDown ? `Try again in ${formatCountdown(cooldownUntil - now)}` : busy ? 'Checking…' : 'Check answer'}
            </button>
            <p className="mt-2 text-center text-[12px] text-muted-foreground">
              Solving shows the <span className="font-semibold text-foreground">region</span>, not the spot
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
