import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { KeyRound, MapPin, RotateCw, Share, X } from 'lucide-react'

import { LANDING_URL, type Card } from '../../lib/api'
import { TIER_LABELS } from '../../lib/entitlement'
import { RARITY, rarityColor, silhouetteTitle } from '../../lib/rarity'
import HoloCard from '../reactbits/HoloCard'

/**
 * Vieques Cards card detail (docs/CARD_UI_SPEC.md S-7, L-2, W-1, W-2, M-1,
 * M-3, M-4, T-1…T-4). Opened from a card pin (P-3) or a Collection grid tap
 * (S-6). Lazy-loaded by MapView (C-3); MapView pauses the radar pill and hides
 * the banner while it's open (W-2, L-4) and owns the Back-gesture entry.
 *
 * What it shows depends on what you may know about the card:
 *   owned       one live HoloCard (rarity preset), tap flips to the back
 *               (island outline + find spot, date, badges); serial, lore,
 *               "Show on map", Share.
 *   revealed    (pinned, not collected) still a silhouette — P-6: the face
 *               (name, lore, art) is first seen in the claim reveal (S-5).
 *               "Not collected yet", rarity, region, "Show on map"; in
 *               collect range "Collect" (picks it for the banner), else
 *               "Walk within N m to collect".
 *   unfound     a silhouette: the shared back, rarity, region (unless a locate
 *               riddle hides it), hint. No name or art (P-5). With an unsolved
 *               locate riddle: "Solve the riddle" → S-8.
 *   locked      (rarity above your pass, not owned) the inline upsell under
 *               the card, ResultsList style.
 * Close: ✕ · tap outside · swipe down · Escape · Back (MapView).
 * Reduced motion (M-3): HoloCard drops its tilt/foil drift and flips at once;
 * the overlay only fades.
 */

/** S-5's opened-card size, so a card looks the same in the reveal and here. */
const CARD_MAX_W = 300
const CARD_MIN_W = 132
/** Gap above the card (mt-3) + below it (mt-4) + slack. */
const CARD_GAPS = 12 + 16 + 8
/** 63:88, the face generator's ratio (S-11). */
const CARD_RATIO = 630 / 880
/** The face is drawn with a 44px radius on 630px (S-11). */
const FACE_RADIUS_RATIO = 44 / 630
/** Overlay fade out, matching .vq-reveal's 180ms fade in. */
const FADE_MS = 180
/** Swipe-down distance that closes. */
const SWIPE_CLOSE_PX = 90

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function article(word: string): 'A' | 'An' {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

export type CardDetailProps = {
  card: Card
  onClose: () => void
  /** "Show on map" (M-1). Only offered for a card the server located for you (P-5). */
  onShowOnMap: (card: Card) => void
  /** Unfound card with an unsolved locate riddle → the riddle sheet (S-8). */
  onSolveRiddle: (card: Card) => void
  /** Revealed, not collected: inside its collect radius right now. */
  inRange?: boolean
  /** Touch device (S-10): a laptop says where cards are collected instead. */
  canCollect?: boolean
  /** "Collect" (S-7): close and pick the card for the banner (S-4). */
  onCollect?: (card: Card) => void
}

/** S-10: desktop has no GPS worth hunting with. */
const DESKTOP_COPY = 'Cards are collected on your phone, on the island.'

export default function CardDetail({
  card,
  onClose,
  onShowOnMap,
  onSolveRiddle,
  inRange = false,
  canCollect = false,
  onCollect,
}: CardDetailProps) {
  const style = RARITY[card.rarity]
  const owned = card.owned
  /** Located for you (pinned) — owned or not. */
  const located = owned || card.revealed
  /** P-6: the face (name, art, lore) only once collected. */
  const revealed = owned
  const pinnedOnly = located && !owned
  const name = owned ? (card.name ?? silhouetteTitle(card.rarity)) : null
  const lockedTier = card.lockedByTier && !owned ? card.minTier : null
  const riddle =
    !owned && card.challenge?.kind === 'locate' && !card.challenge.solved ? card.challenge : null
  const serialLabel = owned && card.serialNo != null ? `#${pad3(card.serialNo)}` : null

  // --- Faces --------------------------------------------------------------------
  // Owned: front + back (the flip). Revealed: front only. Unfound: the shared back.
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [backUrl, setBackUrl] = useState<string | null>(null)
  const [unfoundUrl, setUnfoundUrl] = useState<string | null>(null)
  const [shareFile, setShareFile] = useState<File | null>(null)
  useEffect(() => {
    let alive = true
    void import('../../lib/cardFace').then((m) => {
      if (!revealed) {
        m.unfoundBackUrl()
          .then((url) => alive && setUnfoundUrl(url))
          .catch(() => undefined)
        return
      }
      m.cardFrontUrl({ ...card, name: card.name ?? '' })
        .then(async (url) => {
          if (!alive) return
          setFrontUrl(url)
          if (!owned) return
          // Built ahead of the tap: iOS only lets navigator.share run inside
          // the tap itself (same as the claim reveal).
          const blob = await fetch(url).then((r) => r.blob())
          if (alive) setShareFile(new File([blob], `${card.slug}.png`, { type: 'image/png' }))
        })
        .catch(() => undefined)
      if (owned) {
        m.cardBackUrl({
          slug: card.slug,
          rarity: card.rarity,
          serialNo: card.serialNo,
          center: card.location?.center ?? null,
          claimedAt: card.claimedAt,
          // The API doesn't send achievement rules yet, so "counts toward" is
          // empty (same as the Collection's flip, step 7).
          badges: [],
        })
          .then((url) => alive && setBackUrl(url))
          .catch(() => undefined)
      }
    })
    return () => {
      alive = false
    }
  }, [card, revealed, owned])

  // --- Card size: ~300 wide, shrinking only to fit (as the claim reveal) -------
  const stageRef = useRef<HTMLDivElement>(null)
  const [aboveEl, setAboveEl] = useState<HTMLElement | null>(null)
  const [belowEl, setBelowEl] = useState<HTMLElement | null>(null)
  const [cardW, setCardW] = useState(CARD_MAX_W)
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
  const cardH = Math.round(cardW / CARD_RATIO)
  const cardRadius = Math.round(cardW * FACE_RADIUS_RATIO)

  // --- Closing: ✕ · tap outside · swipe down · Escape ----------------------------
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    // Fade out, then unmount — the HoloCard's WebGL context goes with it (W-2).
    window.setTimeout(onClose, FADE_MS)
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
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
    // The card tilts under a finger and the buttons are buttons — not a swipe.
    if ((e.target as Element).closest('[data-no-swipe], a, button:not(.vq-reveal__scrim)')) return
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
    if (dragY > SWIPE_CLOSE_PX) close()
    else setDragY(0)
  }

  // --- Share (owned cards: the face image, like the claim reveal) --------------
  const canShare = owned && typeof navigator.share === 'function'
  const share = () => {
    const text = `${name} · ${style.label}${serialLabel ? ` · ${serialLabel}` : ''} · Explore Vieques`
    const data: ShareData = { title: name ?? 'Card', text }
    if (shareFile && navigator.canShare?.({ files: [shareFile] })) data.files = [shareFile]
    navigator.share(data).catch(() => undefined) // dismissed share sheet = fine
  }

  // --- Render -----------------------------------------------------------------
  const pass = lockedTier ? (TIER_LABELS[lockedTier] ?? lockedTier) : null
  const canShowOnMap = located && card.location != null
  const title = name ?? (pinnedOnly ? silhouetteTitle(card.rarity) : 'Not found yet')
  /** S-7 revealed, not owned: collect here (T-4) or how close to get. */
  const collectable = pinnedOnly && !lockedTier && !card.soldOut
  const showCollect = collectable && canCollect && inRange && onCollect != null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vq-card-detail-name"
      tabIndex={-1}
      // L-2: fixed inset-0 z-[70], the AddToTripSheet slot; pointer-events-auto
      // because vaul sets pointer-events:none on <body>. touch-action none so a
      // downward drag is ours (swipe to close). The .vq-reveal fade is the one
      // entrance (M-4).
      className={`vq-reveal pointer-events-auto fixed inset-0 z-[70] flex justify-center outline-none sm:items-center ${
        closing ? 'vq-reveal--out' : ''
      }`}
      style={{ touchAction: 'none', overflowX: 'clip' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {/* Scrim — tapping it is "tap outside". The claim reveal's frosted navy
          with a glow in the card's rarity colour (T-1 token). */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className="vq-reveal__scrim absolute inset-0 cursor-default"
        style={{ ['--vq-reveal-glow' as string]: rarityColor(card.rarity) }}
      />

      <div
        className="pointer-events-none relative flex h-full w-full max-w-md flex-col items-center px-6 pt-[calc(var(--sat)+12px)] pb-[calc(var(--sab)+16px)] sm:h-[min(760px,calc(100dvh-48px))]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          opacity: dragY ? Math.max(0.35, 1 - dragY / 360) : undefined,
          transition: dragging ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
        }}
      >
        {/* ✕ (T-2: lucide, not a glyph). */}
        <div className="flex w-full shrink-0 justify-end">
          <button
            type="button"
            onClick={close}
            aria-label="Close card"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/14 hover:text-foreground"
          >
            <X size={17} />
          </button>
        </div>

        {/* The stage: what it is, the card, its story — centred as one group;
            the card takes the height the rest leaves. */}
        <div
          ref={stageRef}
          className="flex min-h-0 w-full flex-1 flex-col items-center"
          style={{
            justifyContent: 'safe center',
            ...(tight && { overflowY: 'auto', touchAction: 'pan-y', pointerEvents: 'auto' }),
          }}
        >
          <div ref={setAboveEl} className="flex w-full flex-col items-center text-center">
            {pinnedOnly && (
              // It must never read as owned (S-7).
              <p className="mb-1 rounded-full border border-white/12 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-foreground uppercase">
                Not collected yet
              </p>
            )}
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase">
              <span className={style.textClass}>{style.label}</span>
              {card.region ? (
                <span className="text-muted-foreground"> · {card.region}</span>
              ) : (
                !located && <span className="text-muted-foreground"> · Mystery</span>
              )}
            </p>
            <h2
              id="vq-card-detail-name"
              className="mt-1 max-w-full truncate font-display text-[28px] leading-tight tracking-tight text-foreground"
            >
              {title}
            </h2>
          </div>

          <div data-no-swipe className="pointer-events-auto relative mt-3">
            {revealed ? (
              frontUrl ? (
                <HoloCard
                  // Call-site tuning (C-2): the rarity's foil preset + intensity
                  // (T-1 map), the face's own corner radius, a light lift. The
                  // back is the flip (owned only). idle off: no looping drift
                  // while you read (M-4) — tilt still follows the finger.
                  image={frontUrl}
                  backImage={owned && backUrl ? backUrl : undefined}
                  alt={`${name}, ${style.label} card${serialLabel ? `, ${serialLabel}` : ''}${
                    owned ? '. Tap to flip' : ''
                  }`}
                  preset={style.holo.preset}
                  intensity={style.holo.intensity}
                  width={cardW}
                  radius={cardRadius}
                  hoverScale={1.02}
                  idle={false}
                />
              ) : (
                // The face is still drawing (fonts + canvas): hold its space.
                <div style={{ width: cardW, height: cardH }} />
              )
            ) : (
              // Silhouette (S-7): the shared "not yet found" back in the rarity
              // rim — a static image, no WebGL for a card you haven't found.
              <div
                className="overflow-hidden border-[1.5px] bg-secondary"
                style={{
                  width: cardW,
                  height: cardH,
                  borderRadius: cardRadius,
                  borderColor: rarityColor(card.rarity),
                  opacity: lockedTier ? 0.6 : undefined,
                }}
              >
                {unfoundUrl && (
                  <img src={unfoundUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                )}
              </div>
            )}
          </div>

          <div ref={setBelowEl} className="pointer-events-auto mt-4 flex w-full flex-col items-center text-center">
            {owned && backUrl && (
              <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <RotateCw size={13} aria-hidden="true" />
                Tap to flip
              </p>
            )}
            {serialLabel && (
              <p className="mt-1 font-mono text-[13px] text-foreground">
                {serialLabel}
                {card.maxClaims != null && (
                  <span className="text-muted-foreground"> of {pad3(card.maxClaims)}</span>
                )}
              </p>
            )}
            {revealed && card.lore && (
              <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-foreground/90">{card.lore}</p>
            )}
            {!located && card.hint && (
              <p className="mt-1 max-w-[34ch] text-[14px] leading-relaxed text-foreground/90">
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Hint
                </span>{' '}
                · {card.hint}
              </p>
            )}

            {/* Locked rarity: ResultsList-style inline upsell (S-7, S-4 ④ copy). */}
            {pass && (
              <div className="mt-3 w-full rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-left text-sm text-foreground">
                <p>
                  {article(pass)} {pass} pass unlocks {style.label.toLowerCase()} cards.
                </p>
                <a
                  href={`${LANDING_URL}/pricing`}
                  className="mt-2.5 grid h-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
                >
                  See passes
                </a>
              </div>
            )}

            {/* Revealed, not collected (S-7): how to get it. */}
            {pinnedOnly && card.soldOut && (
              <p className="mt-2 text-[14px] text-muted-foreground">Every copy has been collected</p>
            )}
            {collectable && !canCollect && <p className="mt-2 text-[14px] text-muted-foreground">{DESKTOP_COPY}</p>}
            {collectable && canCollect && !inRange && card.location && (
              <p className="mt-2 text-[14px] text-foreground">
                Walk within {Math.round(card.location.radiusM)} m to collect
              </p>
            )}
          </div>
        </div>

        {/* Actions. */}
        {(canShowOnMap || canShare || riddle || showCollect) && (
          <div className="pointer-events-auto mt-4 flex w-full shrink-0 gap-2.5">
            {showCollect && (
              <button
                type="button"
                onClick={() => onCollect?.(card)}
                className="h-12 flex-1 rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
              >
                Collect
              </button>
            )}
            {riddle && (
              <button
                type="button"
                onClick={() => onSolveRiddle(card)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
              >
                <KeyRound size={17} aria-hidden="true" />
                Solve the riddle
              </button>
            )}
            {canShowOnMap && (
              <button
                type="button"
                onClick={() => onShowOnMap(card)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 font-semibold text-foreground active:bg-white/12"
              >
                <MapPin size={17} aria-hidden="true" />
                Show on map
              </button>
            )}
            {canShare && (
              <button
                type="button"
                onClick={share}
                aria-label="Share card"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/12 bg-white/6 text-foreground active:bg-white/12"
              >
                <Share size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

