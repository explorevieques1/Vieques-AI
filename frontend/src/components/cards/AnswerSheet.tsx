import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, X } from 'lucide-react'

import { LANDING_URL, type Card, type CardClaim, type CardPosition } from '../../lib/api'
import { TIER_LABELS } from '../../lib/entitlement'
import { RARITY } from '../../lib/rarity'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { useOutsideSheetFocus } from '../../hooks/useOutsideSheetFocus'
import { failureCopy, formatCountdown, useCardClaim } from './useCardClaim'

/**
 * Vieques Cards answer sheet (docs/CARD_UI_SPEC.md S-4a, L-2, M-3, P-6,
 * T-2…T-4). An on-site question: submitting the answer IS the claim
 * (`POST /claim` with the answer — it replaces the hold; the server still
 * checks distance, accuracy and speed). Opened from the nearby banner's
 * "Answer to collect" (S-4 ③) or an ANSWER_REQUIRED hold. Lazy-loaded by
 * MapView (C-3), which pauses the radar pill, hides the banner and owns the
 * Back-gesture entry while it's open.
 *
 *  - Same shell as the riddle sheet (S-8): rises from the bottom, rides on the
 *    on-screen keyboard (useKeyboardInset), its input can hold focus outside
 *    the map sheet (useOutsideSheetFocus). 16px input; Enter submits.
 *  - Rarity label, never the name (P-6: the face is first seen in S-5).
 *  - Wrong → shake (M-3: a border flash), "Not quite — look around", hint
 *    after 3. Every S-4 "no" shows here, with the same cooldowns as the
 *    banner (shared, useCardClaim).
 *  - Success → `onClaimed`; MapView closes this and opens the reveal (S-5).
 *  - Close: ✕ · tap outside · swipe down · Escape · Back (MapView).
 */

/** Sheet slide in/out (M-3: a plain fade). */
const SLIDE_MS = 220
/** Swipe-down distance that closes. */
const SWIPE_CLOSE_PX = 90
/** The server shows the question's hint after this many misses. */
const HINT_AFTER = 3
/** The server's own ANSWER_REQUIRED sentence, when the catalog has no prompt. */
const NO_PROMPT = 'Answer the question to collect.'

function article(word: string): 'A' | 'An' {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

export type AnswerSheetProps = {
  card: Card
  /** Latest fix from MapView's location watch. */
  fix: CardPosition | null
  onClose: () => void
  /** Successful (or idempotent alreadyOwned) claim → S-5. */
  onClaimed: (card: Card, claim: CardClaim) => void
  /** RIDDLE_UNSOLVED → the riddle sheet (S-8; one z-70 overlay at a time). */
  onSolveRiddle: (card: Card) => void
  /** SOLD_OUT → "See other cards nearby": skip this card. */
  onDismiss: (slug: string) => void
}

export default function AnswerSheet({ card, fix, onClose, onClaimed, onSolveRiddle, onDismiss }: AnswerSheetProps) {
  const style = RARITY[card.rarity]
  const prompt = card.challenge?.prompt ?? NO_PROMPT
  const keyboard = useKeyboardInset()

  const [answer, setAnswer] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const claim = useCardClaim({ card, fix, onClaimed, shakeRef: inputRef })
  const wrong = claim.failure?.code === 'WRONG_ANSWER'

  // --- Close: ✕ · tap outside · swipe down · Escape (Back is MapView's) -------
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
  useOutsideSheetFocus(dialogRef) // the input sits outside the (secretly modal) map sheet
  useEffect(() => {
    // Opened by a tap, so a phone may raise the keyboard straight away.
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const drag = useRef<{ id: number; y0: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const onPointerDown = (e: ReactPointerEvent) => {
    // The field and the buttons are theirs, not a swipe.
    if ((e.target as Element).closest('input, button, a')) return
    drag.current = { id: e.pointerId, y0: e.clientY }
    setDragging(true)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    setDragY(Math.max(0, e.clientY - d.y0))
  }
  const onPointerEnd = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (dragY > SWIPE_CLOSE_PX) close()
    else setDragY(0)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault() // Enter submits the form; the page never reloads
    const text = answer.trim()
    if (!text || !fix || claim.busy || claim.coolingDown || closingRef.current) return
    claim.submit(fix, text)
  }

  const message = claim.failure && !wrong ? failureCopy(claim.failure, card, claim.distM, 'No connection — try again') : null
  const pass = claim.lockedTier ? (TIER_LABELS[claim.lockedTier] ?? claim.lockedTier) : null
  const blocked = pass != null || claim.soldOut

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
      aria-labelledby="vq-answer-title"
      tabIndex={-1}
      // L-2: fixed inset-0 z-[70], the AddToTripSheet pattern (sheet from the
      // bottom on a phone, centred on desktop); pointer-events-auto because
      // vaul sets pointer-events:none on <body>.
      className="pointer-events-auto fixed inset-0 z-[70] flex items-end justify-center outline-none sm:items-center"
    >
      <button
        type="button"
        aria-label="Close question"
        tabIndex={-1}
        onClick={close}
        className={`absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm ${
          closing ? 'vq-riddle--fade-out' : 'vq-reveal-fade'
        }`}
      />

      <div
        // Frosted (G-1: taller than 64px, so not GlassSurface). Keyboard-safe:
        // lifted by the keyboard's height; the home-indicator pad only when
        // there's no keyboard over it. touch-action none: a drag is ours.
        className={`vq-cards-sheet relative w-full max-w-md rounded-t-3xl px-4 pt-2 sm:rounded-3xl sm:pb-4 ${sheetAnim}`}
        style={{
          marginBottom: keyboard,
          paddingBottom: keyboard ? 16 : 'calc(1rem + var(--sab))',
          touchAction: 'none',
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 220ms ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className="flex items-center justify-between">
          <span aria-hidden="true" className="mx-auto h-1.5 w-10 rounded-full bg-white/20 sm:invisible" />
        </div>
        <div className="mt-2 flex items-start gap-3">
          <p className="flex-1 pt-1 font-mono text-[10px] tracking-[0.14em] uppercase">
            <span className={style.textClass}>{style.label}</span>
            <span className="text-muted-foreground"> · One question</span>
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

        <form onSubmit={submit} className="mt-1">
          <h2 id="vq-answer-title" className="font-display text-[22px] leading-snug text-foreground">
            {prompt}
          </h2>
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value)
              claim.clearWrong()
            }}
            onAnimationEnd={(e) => e.currentTarget.classList.remove('vq-shake')}
            placeholder="Your answer"
            aria-label="Your answer"
            aria-invalid={wrong || undefined}
            aria-describedby="vq-answer-status"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            disabled={claim.coolingDown || blocked}
            className={`mt-3 h-11 w-full rounded-xl border bg-white/6 px-3.5 text-[16px] text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none disabled:opacity-60 ${
              wrong ? 'border-destructive/70' : 'border-white/12'
            }`}
          />
          <p id="vq-answer-status" role="status" aria-live="polite" className="mt-2 min-h-[18px] text-[12px] text-muted-foreground">
            {claim.soldOut ? (
              <span className="text-foreground">Every copy has been collected</span>
            ) : message ? (
              message.action ? (
                <button
                  type="button"
                  onClick={() => onSolveRiddle(card)}
                  className="inline-flex items-center gap-0.5 font-semibold text-primary"
                >
                  {message.text}
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ) : (
                <span className="text-foreground">{message.text}</span>
              )
            ) : wrong ? (
              <>
                <span className="text-foreground">Not quite — look around</span>
                {!claim.hint && ` · hint after ${HINT_AFTER}`}
              </>
            ) : null}
          </p>
          {claim.hint && !blocked && (
            <p className="mt-1 text-[13px] text-foreground">
              <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Hint</span> ·{' '}
              {claim.hint}
            </p>
          )}

          {pass ? (
            // UPGRADE_REQUIRED: the S-4 ④ upsell, here.
            <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-sm text-foreground">
              <p>
                {article(pass)} {pass} pass unlocks {style.label.toLowerCase()} cards. Upgrade now and collect it
                while you're here.
              </p>
              <a
                href={`${LANDING_URL}/pricing`}
                className="mt-2.5 grid h-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
              >
                See passes
              </a>
            </div>
          ) : claim.soldOut ? (
            <button
              type="button"
              onClick={() => {
                onDismiss(card.slug)
                close()
              }}
              className="mt-3 flex h-12 w-full items-center justify-center gap-1 rounded-2xl border border-white/12 bg-white/6 font-semibold text-foreground active:bg-white/12"
            >
              See other cards nearby
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={claim.busy || claim.coolingDown || !fix || answer.trim() === ''}
              className="mt-3 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground disabled:opacity-50"
            >
              {claim.coolingDown
                ? `Try again in ${formatCountdown(claim.remaining)}`
                : claim.busy
                  ? 'Collecting…'
                  : 'Collect'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
