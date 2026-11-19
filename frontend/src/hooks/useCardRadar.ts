import { useEffect, useRef, useState } from 'react'

import {
  ApiError,
  cardsNearby,
  type Card,
  type CardPosition,
  type CardWarmth,
  type RadarBucket,
} from '../lib/api'
import { milesBetween } from '../lib/geo'
import { playSound } from '../lib/sound'

/**
 * Vieques Cards radar (docs/CARD_UI_SPEC.md S-2, R-1, W-2).
 *
 * Takes the fix from the map's own `watchPosition` (MapView) — it never starts
 * a second location watch — and pings POST /api/cards/nearby:
 *   - only while the radar is on,
 *   - only once the phone has moved ≥ RADAR_MIN_MOVE_M since the last answered
 *     ping (the first ping after switching on always goes),
 *   - at most every RADAR_MIN_INTERVAL_MS,
 *   - never while the tab is hidden (`document.hidden`).
 *
 * A ping the server couldn't use (weak GPS, network error, rate limit) does not
 * count as "answered", so it is retried at the next allowed slot without having
 * to walk 75 m first — that is the "auto-retry" behind `Weak GPS · step outside`.
 *
 * Island fence: there is deliberately NO client-side "on Vieques" box. Testers
 * (CARD_TESTER_IDS) skip the fence on the server, so only the server can say
 * "off the island". `offIsland` is set only from a NOT_ON_ISLAND error code.
 */

/** R-1: metres the phone must move before the next radar ping. */
export const RADAR_MIN_MOVE_M = 75
/** R-1: minimum gap between radar pings. */
export const RADAR_MIN_INTERVAL_MS = 20_000

const METRES_PER_MILE = 1609.344

/** Coldest → hottest; a step up the ladder plays SoundPing once (S-2). */
const WARMTH_RANK: Record<CardWarmth, number> = { cold: 0, warm: 1, hot: 2, burning: 3 }

export type RadarStatus =
  | 'scanning' // on, waiting for a fix or the first answer
  | 'none' // answered: nothing within radar range
  | 'signal' // answered: 1 / 2–3 / 4+ nearby with a warmth word
  | 'weak' // the server said the fix is too coarse to scan with
  | 'offIsland' // the server said NOT_ON_ISLAND
  | 'blocked' // location permission denied

export type CardRadarState = {
  status: RadarStatus
  count: RadarBucket
  warmth: CardWarmth | null
  /** Cards that entered reveal range on the latest ping (steps 4–5 use these). */
  revealed: Card[]
}

const SCANNING: CardRadarState = { status: 'scanning', count: '0', warmth: null, revealed: [] }

type Args = {
  /** Radar switched on (and this layout shows it). */
  on: boolean
  /** Latest fix from MapView's location watch; null until the first one. */
  fix: CardPosition | null
  /** The location watch failed with PERMISSION_DENIED. */
  locationBlocked: boolean
}

function metresBetween(a: CardPosition, b: CardPosition): number {
  return milesBetween([a.lng, a.lat], [b.lng, b.lat]) * METRES_PER_MILE
}

export function useCardRadar({ on, fix, locationBlocked }: Args): CardRadarState {
  const [reply, setReply] = useState<CardRadarState>(SCANNING)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  // Bumped to re-run the scheduler: when the 20 s gate opens, and after a ping settles.
  const [tick, setTick] = useState(0)

  const lastPingAt = useRef(0)
  /** Position of the last ping the server actually answered. */
  const lastAnsweredPos = useRef<CardPosition | null>(null)
  const inFlight = useRef(false)
  const lastWarmth = useRef<CardWarmth | null>(null)
  /** Incremented on every off → late replies from a previous session are dropped. */
  const session = useRef(0)

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Switching off forgets everything, so switching on scans from scratch.
  // The reply resets during render (React's "adjust state on prop change"),
  // the refs in an effect.
  const [wasOn, setWasOn] = useState(on)
  if (on !== wasOn) {
    setWasOn(on)
    if (!on) setReply(SCANNING)
  }
  useEffect(() => {
    if (on) return
    session.current += 1
    lastPingAt.current = 0
    lastAnsweredPos.current = null
    lastWarmth.current = null
    inFlight.current = false
  }, [on])

  useEffect(() => {
    if (!on || !fix || hidden || inFlight.current) return
    const moved = lastAnsweredPos.current ? metresBetween(lastAnsweredPos.current, fix) : Infinity
    if (moved < RADAR_MIN_MOVE_M) return

    const wait = lastPingAt.current + RADAR_MIN_INTERVAL_MS - Date.now()
    if (wait > 0) {
      const t = window.setTimeout(() => setTick((n) => n + 1), wait)
      return () => window.clearTimeout(t)
    }

    const mySession = session.current
    const pos = fix
    inFlight.current = true
    lastPingAt.current = Date.now()
    cardsNearby(pos)
      .then((res) => {
        if (session.current !== mySession) return
        if (res.lowAccuracy) {
          setReply({ ...SCANNING, status: 'weak' })
          return
        }
        lastAnsweredPos.current = pos
        const { count, warmth } = res.radar
        const prev = lastWarmth.current
        if (warmth && prev && WARMTH_RANK[warmth] > WARMTH_RANK[prev]) playSound('ping')
        lastWarmth.current = warmth
        setReply({
          status: count === '0' ? 'none' : 'signal',
          count,
          warmth,
          revealed: res.revealed ?? [],
        })
      })
      .catch((e: unknown) => {
        if (session.current !== mySession) return
        if (e instanceof ApiError && e.code === 'NOT_ON_ISLAND') {
          lastAnsweredPos.current = pos
          lastWarmth.current = null
          setReply({ ...SCANNING, status: 'offIsland' })
        }
        // Anything else (network, 429, 5xx): keep showing the last answer and
        // retry at the next allowed slot.
      })
      .finally(() => {
        if (session.current !== mySession) return
        inFlight.current = false
        setTick((n) => n + 1)
      })
  }, [on, fix, hidden, tick])

  if (!on) return SCANNING
  // A fix wins over an old denial (the user turned location back on).
  if (locationBlocked && !fix) return { ...SCANNING, status: 'blocked' }
  return reply
}
