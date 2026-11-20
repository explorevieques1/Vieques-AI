import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'
import { MapPin, Radar, Volume2, X } from 'lucide-react'

import { useCardsCatalog } from '../../hooks/useCardsCatalog'
import { armCardRadar } from '../../hooks/useCardRadar'
import { fetchAchievements, type Achievement, type Card } from '../../lib/api'
import { badgeStickerUrl, cardBackUrl, cardFrontUrl, unfoundBackUrl } from '../../lib/cardFace'
import { TIER_LABELS } from '../../lib/entitlement'
import { RARITIES, RARITY, type Rarity } from '../../lib/rarity'
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from '../../lib/sound'
import { Group, Row } from '../MenuBody'
import PillSlider from '../PillSlider'
import TiltedCard from '../reactbits/TiltedCard'
import CardSwitch from './CardSwitch'
import LoadFailed from './LoadFailed'
import TopTravelerTab from './TopTravelerTab'

/**
 * Vieques Cards — the Collection pane (docs/CARD_UI_SPEC.md S-6, L-5, T-3,
 * T-5, W-3, M-3, I-3). Your inventory, as sheet content: MapView renders it
 * in the sheet at SHEET_FULL with the sheet's ⌄ (phone), or in Saved's
 * floating-panel slot (desktop). Lazy-loaded (C-3).
 *
 *  Cards   owned / total + points, progress bar, region tallies (Group/Row,
 *          riddle-locked under "Mystery"), PillSlider rarity filter, a
 *          3-column TiltedCard grid (touch tilt, no gyro — W-3), then the
 *          Sound · Card radar settings rows.
 *            found (owned) = its generated face · not found = the shared back
 *            · rarity your pass can't collect = dimmed.
 *            tap → card detail (S-7, step 8 — `onOpenCard`) · long-press →
 *            flips an owned card to its back.
 *  Badges  earned first (static sticker), then in progress (dashed outline +
 *          bar, "Beach Bum 3/5").
 *  Top Traveler  This week / All-time board (TopTravelerTab, step 9).
 */

/** S-6: "Tab hidden until the leaderboard endpoint exists." Live since step 9
 *  (GET /api/leaderboard). Set false to hide the tab again without a deploy of
 *  the backend. */
// Top Traveler shows when the server opens it to this caller (`catalog.leaderboard`):
// testers only until launch day, when backend LEADERBOARD_LIVE flips with CARDS_LIVE.

/** How long a press must hold still to flip a grid card. */
const LONG_PRESS_MS = 450
/** Finger travel that turns a press into a scroll (no flip, no tap). */
const LONG_PRESS_SLOP_PX = 8

/** The face generator draws a 44px radius on 630px (S-11); the thumbnail keeps the ratio. */
const FACE_RADIUS_RATIO = 44 / 630

type Segment = 'cards' | 'badges' | 'top'

type Props = {
  /** Desktop panel only — the phone uses the sheet's ⌄. */
  onClose?: () => void
  /** Mobile: clear the floating bottom nav at the scroller's foot. */
  navPad?: boolean
  /** The radar toggle (S-1 mirror) — both layouts (S-10). Omitted → no radar row / CTA. */
  radarOn?: boolean
  onRadarChange?: (next: boolean) => void
  /** Empty state's "Turn on radar": radar on + back to the map. */
  onTurnOnRadar?: () => void
  /** Card detail (S-7) — wired in build-order step 8. */
  onOpenCard?: (card: Card) => void
}

const microLabel = 'font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground'

/**
 * Run a face-generator call outside React's commit: lib/cardFace renders lucide
 * glyphs with flushSync, which React refuses inside an effect.
 */
function deferred<T>(draw: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(draw)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export default function CollectionBody({
  onClose,
  navPad = false,
  radarOn,
  onRadarChange,
  onTurnOnRadar,
  onOpenCard,
}: Props) {
  const [segment, setSegment] = useState<Segment>('cards')
  const { catalog, failed, reload } = useCardsCatalog()

  // Badges feed both tabs: their points count toward the Cards header total.
  const [achievements, setAchievements] = useState<Achievement[] | null>(null)
  const [badgesFailed, setBadgesFailed] = useState(false)
  const [badgeReloads, setBadgeReloads] = useState(0)
  useEffect(() => {
    let alive = true
    fetchAchievements()
      .then((a) => {
        if (!alive) return
        setAchievements(a)
        setBadgesFailed(false)
      })
      .catch((e) => {
        console.warn('[cards] achievements', e)
        if (alive) setBadgesFailed(true)
      })
    return () => {
      alive = false
    }
  }, [badgeReloads])

  const tab = (id: Segment, label: string) => (
    <button
      key={id}
      onClick={() => setSegment(id)}
      aria-pressed={segment === id}
      className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        segment === id
          ? 'bg-white/10 text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )

  return (
    <>
      {/* Title row. pr-12 clears the sheet's ⌄ (MapSheet onCollapse). */}
      <div className="flex shrink-0 items-center gap-2 px-4 pr-12 pt-3 sm:pr-4">
        <h2 className="flex-1 font-display text-xl leading-none tracking-tight">Collection</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close collection"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Segmented control — SavedBody's tab() styles (T-5). */}
      <div className="flex shrink-0 px-4 pt-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-white/[0.04] p-1">
          {tab('cards', 'Cards')}
          {tab('badges', 'Badges')}
          {catalog?.leaderboard && tab('top', 'Top Traveler')}
        </div>
      </div>

      <div
        className={`scroll-contain scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-3 ${
          navPad ? 'pb-[calc(1rem+var(--nav-clear))]' : 'pb-4'
        }`}
      >
        {segment === 'top' ? (
          <TopTravelerTab radarOn={radarOn} onTurnOnRadar={onTurnOnRadar} />
        ) : segment === 'cards' ? (
          <CardsTab
            cards={catalog?.cards ?? null}
            owned={catalog?.owned ?? 0}
            total={catalog?.total ?? 0}
            regions={catalog?.regions ?? []}
            failed={failed}
            onRetry={reload}
            achievements={achievements}
            radarOn={radarOn}
            onRadarChange={onRadarChange}
            onTurnOnRadar={onTurnOnRadar}
            onOpenCard={onOpenCard}
          />
        ) : (
          <BadgesTab
            achievements={achievements}
            failed={badgesFailed}
            onRetry={() => setBadgeReloads((n) => n + 1)}
          />
        )}
      </div>
    </>
  )
}

// --- Cards tab ---------------------------------------------------------------

function CardsTab({
  cards,
  owned,
  total,
  regions,
  failed,
  onRetry,
  achievements,
  radarOn,
  onRadarChange,
  onTurnOnRadar,
  onOpenCard,
}: {
  cards: Card[] | null
  owned: number
  total: number
  regions: { region: string | null; found: number; total: number }[]
  failed: boolean
  onRetry: () => void
  achievements: Achievement[] | null
  radarOn?: boolean
  onRadarChange?: (next: boolean) => void
  onTurnOnRadar?: () => void
  onOpenCard?: (card: Card) => void
}) {
  const [filter, setFilter] = useState<Rarity | null>(null)
  /** One card shows its back at a time (long-press). */
  const [flippedSlug, setFlippedSlug] = useState<string | null>(null)
  const [reduced] = useState(prefersReducedMotion)

  const [unfoundUrl, setUnfoundUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    deferred(unfoundBackUrl)
      .then((url) => alive && setUnfoundUrl(url))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // Points: rarity points of every card held + each earned badge's points
  // (Card UI Mapping p.10; mirrors RARITY_POINTS in backend/cards.js).
  const points = useMemo(() => {
    const fromCards = (cards ?? []).reduce((n, c) => n + (c.owned ? RARITY[c.rarity].points : 0), 0)
    const fromBadges = (achievements ?? []).reduce((n, a) => n + (a.earnedAt ? a.points : 0), 0)
    return fromCards + fromBadges
  }, [cards, achievements])

  const shown = useMemo(
    () => (cards ?? []).filter((c) => filter == null || c.rarity === filter),
    [cards, filter],
  )

  if (!cards) {
    if (failed) return <LoadFailed what="your cards" onRetry={onRetry} />
    return (
      <>
        <div className="h-14 rounded-2xl bg-muted" />
        <div className="h-36 rounded-2xl bg-muted" />
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[63/88] rounded-lg bg-muted" />
          ))}
        </div>
      </>
    )
  }

  const pct = total > 0 ? Math.round((owned / total) * 100) : 0

  return (
    <>
      {total > 0 && (
        <section aria-label="Progress">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-foreground">
              <span className="text-2xl font-semibold tabular-nums">{owned}</span>
              <span className="text-base text-muted-foreground"> / {total}</span>
            </p>
            <span className={microLabel}>{points} pts</span>
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-white/8"
            role="progressbar"
            aria-label="Cards collected"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={owned}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </section>
      )}

      {/* S-6 empty: no cards yet. */}
      {owned === 0 && (
        <div className="rounded-2xl bg-white/4 px-4 py-5 text-center">
          <p className="mx-auto max-w-[30ch] text-sm leading-relaxed text-foreground">
            Turn on the radar and explore — your first card is closer than you think.
          </p>
          {onTurnOnRadar && !radarOn && (
            <button
              onClick={() => {
                armCardRadar() // I-1: inside the tap
                onTurnOnRadar()
              }}
              className="mt-4 h-12 w-full rounded-2xl bg-gradient-to-br from-primary to-accent-sky font-semibold text-primary-foreground"
            >
              Turn on radar
            </button>
          )}
        </div>
      )}

      {/* Region tallies (S-6): riddle-locked cards count under "Mystery". */}
      {regions.length > 0 && (
        <Group>
          {regions.map((r) => (
            <Row
              key={r.region ?? '__mystery'}
              icon={<MapPin size={16} />}
              label={r.region ?? 'Mystery'}
              detail={
                <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
                  {r.found} of {r.total}
                </span>
              }
            />
          ))}
        </Group>
      )}

      {total > 0 && (
        <>
          {/* Rarity filter — PillSlider, never a hand-rolled chip row (T-5). */}
          <div className="flex rounded-xl bg-white/[0.04] p-1">
            <PillSlider
              label="Card rarity"
              active={filter}
              onSelect={(k) => setFilter(k as Rarity | null)}
              items={[
                { key: null, label: 'All' },
                ...RARITIES.map((r) => ({ key: r, label: RARITY[r].label })),
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm leading-relaxed text-muted-foreground">
              {filter === 'legendary'
                ? 'No legendary cards yet — they hide in the hardest places.'
                : `No ${filter ? RARITY[filter].label.toLowerCase() : ''} cards yet.`}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {shown.map((c) => (
                <GridCard
                  key={c.slug}
                  card={c}
                  unfoundUrl={unfoundUrl}
                  reduced={reduced}
                  flipped={flippedSlug === c.slug}
                  onFlip={() => setFlippedSlug((cur) => (cur === c.slug ? null : c.slug))}
                  onOpen={onOpenCard}
                />
              ))}
            </div>
          )}
        </>
      )}

      <SettingsRows radarOn={radarOn} onRadarChange={onRadarChange} />
    </>
  )
}

/**
 * One grid thumbnail: TiltedCard (CSS, no WebGL — W-3) over the generated face.
 * Tilt follows the finger only (gyroscope off); none under reduced motion (M-3).
 */
function GridCard({
  card,
  unfoundUrl,
  reduced,
  flipped,
  onFlip,
  onOpen,
}: {
  card: Card
  unfoundUrl: string | null
  reduced: boolean
  flipped: boolean
  onFlip: () => void
  onOpen?: (card: Card) => void
}) {
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [backUrl, setBackUrl] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Found = its face. Unfound cards share the one back (S-6, S-11).
  useEffect(() => {
    if (!card.owned) return
    let alive = true
    deferred(() => cardFrontUrl({ ...card, name: card.name ?? '' }))
      .then((url) => alive && setFrontUrl(url))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [card])

  // The back (island outline + find spot, date) is drawn on the first flip only.
  useEffect(() => {
    if (!flipped || !card.owned || backUrl) return
    let alive = true
    deferred(() =>
      cardBackUrl({
        slug: card.slug,
        rarity: card.rarity,
        serialNo: card.serialNo,
        center: card.location?.center ?? null,
        claimedAt: card.claimedAt,
        // The API doesn't send achievement rules yet, so "counts toward" is empty.
        badges: [],
      }),
    )
      .then((url) => alive && setBackUrl(url))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [flipped, card, backUrl])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Long-press → flip (owned cards; an unfound card already shows the back).
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!card.owned) return
    endPress()
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        press.current = null
        swallowClick.current = true
        onFlip()
      }, LONG_PRESS_MS),
    }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) endPress()
  }
  // The click that ends a long-press is the flip, not a tap → detail.
  const onClickCapture = (e: SyntheticEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }
  useEffect(() => {
    const p = press
    return () => {
      if (p.current) window.clearTimeout(p.current.timer)
    }
  }, [])

  const style = RARITY[card.rarity]
  const lockedTier = card.lockedByTier && !card.owned
  const label = card.owned
    ? `${card.name ?? 'Card'} · ${style.label}${card.serialNo != null ? ` · #${String(card.serialNo).padStart(3, '0')}` : ''}`
    : `Not found yet · ${style.label}${card.region ? ` · ${card.region}` : ''}${
        lockedTier ? ` · needs ${TIER_LABELS[card.minTier] ?? card.minTier}` : ''
      }`
  const imageSrc = card.owned ? frontUrl : unfoundUrl
  const radius = Math.max(4, Math.round(width * FACE_RADIUS_RATIO))

  return (
    <div
      ref={boxRef}
      className={`aspect-[63/88] w-full ${lockedTier ? 'opacity-45' : ''}`}
      style={{ WebkitTouchCallout: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
      onClickCapture={onClickCapture}
      onContextMenu={(e) => {
        if (card.owned) e.preventDefault() // no iOS/Android callout on the long-press
      }}
    >
      {imageSrc ? (
        <TiltedCard
          imageSrc={imageSrc}
          altText={label}
          containerWidth="100%"
          containerHeight="100%"
          imageWidth="100%"
          imageHeight="100%"
          radius={radius}
          // W-3: finger tilt only — no gyroscope; M-3: no tilt at all when reduced.
          gyroscope={false}
          rotateAmplitude={reduced ? 0 : 10}
          // The image IS the whole card (rim, corners, serial), not art inside a
          // frame. Parallax over-sizes it by ~6px a side to hide its edges while
          // shifting, which crops the rarity rim and rounded corners off — the
          // grid then shows flat squares. No parallax = the full face, uncut.
          parallax={0}
          scaleOnHover={reduced ? 1 : 1.04}
          // M-4: the pane's entrance is the sheet rising; no per-card intro.
          intro={false}
          showTooltip={false}
          // Tap = detail (S-7); flipping is the long-press, so tap never flips.
          flipOnClick={false}
          flipped={flipped}
          backContent={
            card.owned && backUrl ? (
              <img src={backUrl} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : null
          }
          onClick={onOpen ? () => onOpen(card) : undefined}
        />
      ) : (
        <div className="h-full w-full rounded-lg bg-muted" />
      )}
    </div>
  )
}

/** S-6 settings row: Sound (I-3, same store as the radar pill) · Card radar (mirrors S-1). */
function SettingsRows({
  radarOn,
  onRadarChange,
}: {
  radarOn?: boolean
  onRadarChange?: (next: boolean) => void
}) {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted)
  return (
    <section aria-label="Card settings">
      <h3 className={`mb-2 px-1 ${microLabel}`}>Settings</h3>
      <Group>
        <Row
          icon={<Volume2 size={16} />}
          label="Sound"
          detail={<CardSwitch label="Sound" checked={!muted} onChange={(on) => setSoundMuted(!on)} />}
        />
        {onRadarChange && (
          <Row
            icon={<Radar size={16} />}
            label="Card radar"
            detail={
              <CardSwitch
                label="Card radar"
                checked={Boolean(radarOn)}
                onChange={(on) => {
                  if (on) armCardRadar() // I-1: inside the tap
                  onRadarChange(on)
                }}
              />
            }
          />
        )}
      </Group>
    </section>
  )
}

// --- Badges tab --------------------------------------------------------------

function BadgesTab({
  achievements,
  failed,
  onRetry,
}: {
  achievements: Achievement[] | null
  failed: boolean
  onRetry: () => void
}) {
  const [stickerUrl, setStickerUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    deferred(badgeStickerUrl)
      .then((url) => alive && setStickerUrl(url))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (!achievements) {
    if (failed) return <LoadFailed what="your badges" onRetry={onRetry} />
    return (
      <>
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="h-32 rounded-2xl bg-muted" />
      </>
    )
  }

  const earned = achievements.filter((a) => a.earnedAt)
  const ratio = (a: Achievement) => a.progress.have / a.progress.need
  const progressing = achievements
    .filter((a) => !a.earnedAt && a.progress.need > 0)
    .sort((a, b) => ratio(b) - ratio(a))
  // Every badge still to earn, nearest-to-done first (owner, 2026-11-20: show
  // them all, with what each needs and what it's worth).
  const inProgress = progressing

  return (
    <>
      {earned.length > 0 ? (
        <section>
          <h3 className={`mb-2 px-1 ${microLabel}`}>Earned · {earned.length}</h3>
          <Group>
            {earned.map((a) => (
              <div key={a.slug} className="flex items-center gap-3 px-4 py-3">
                <BadgeSticker src={a.badge} fallback={stickerUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    +{a.points} pts
                    {a.earnedAt &&
                      ` · ${new Date(a.earnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
              </div>
            ))}
          </Group>
        </section>
      ) : (
        <p className="px-2 pt-4 text-center text-sm leading-relaxed text-muted-foreground">
          Collect a set to earn a badge.
        </p>
      )}

      {inProgress.length > 0 && (
        <section>
          <h3 className={`mb-2 px-1 ${microLabel}`}>To earn · {inProgress.length}</h3>
          <Group>
            {inProgress.map((a) => {
              const pct = Math.round(ratio(a) * 100)
              return (
                <div key={a.slug} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 shrink-0 rounded-full border-[1.5px] border-dashed border-muted-foreground/60"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm text-foreground">{a.name}</p>
                      <span className="shrink-0 font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
                        {a.progress.have}/{a.progress.need}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.description ?? `Collect ${a.progress.need} card${a.progress.need === 1 ? '' : 's'}`}
                      {' · '}
                      <span className="font-mono text-primary">+{a.points} pts</span>
                    </p>
                    <div
                      className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8"
                      role="progressbar"
                      aria-label={`${a.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={a.progress.need}
                      aria-valuenow={a.progress.have}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </Group>
        </section>
      )}
    </>
  )
}

/** Earned badge: its art as a static sticker; the generated stand-in until art exists. */
function BadgeSticker({ src, fallback }: { src: string | null; fallback: string | null }) {
  const [broken, setBroken] = useState(false)
  const url = src && !broken ? src : fallback
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-full bg-white/8" />
  )
}
