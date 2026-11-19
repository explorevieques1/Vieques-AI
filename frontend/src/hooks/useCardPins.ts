import { useEffect, useMemo, useState } from 'react'

import { fetchCards, type Card } from '../lib/api'

/**
 * The cards that get a pin on the map (docs/CARD_UI_SPEC.md S-3, P-2, P-5).
 *
 * While `on` (the radar is on):
 *   - GET /api/cards once, keeping only cards the server gave a location for —
 *     revealed or owned. The server withholds every other card's coordinates,
 *     so the client never holds them (P-5).
 *   - Every card the radar reveals (`revealed` from useCardRadar) is merged in
 *     straight away, without a reload, and marked `fresh` for its one pulse.
 * Off forgets everything (P-2: no pins while the radar is off).
 */

export type CardPins = {
  /** Revealed/owned cards with a location, in a stable order. */
  cards: Card[]
  /** Slugs the radar revealed during this session (one marker-pulse each). */
  fresh: ReadonlySet<string>
}

type Args = {
  on: boolean
  /** useCardRadar().revealed — a new array on every answered ping. */
  revealed: Card[]
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const NO_CARDS: Card[] = []

function withLocations(into: Map<string, Card>, cards: Card[]): Map<string, Card> {
  const next = new Map(into)
  for (const c of cards) if (c.location) next.set(c.slug, c)
  return next
}

export function useCardPins({ on, revealed }: Args): CardPins {
  const [bySlug, setBySlug] = useState<Map<string, Card>>(() => new Map())
  const [fresh, setFresh] = useState<ReadonlySet<string>>(EMPTY_SET)

  // Adjust state on prop change, during render (as useCardRadar does):
  // radar off → forget; a new radar reply → merge its reveals.
  const [wasOn, setWasOn] = useState(on)
  const [seenRevealed, setSeenRevealed] = useState(revealed)
  if (on !== wasOn) {
    setWasOn(on)
    if (!on) {
      setBySlug(new Map())
      setFresh(EMPTY_SET)
    }
  }
  if (revealed !== seenRevealed) {
    setSeenRevealed(revealed)
    const located = on ? revealed.filter((c) => c.location) : []
    if (located.length) {
      setBySlug((prev) => withLocations(prev, located))
      setFresh((prev) => new Set([...prev, ...located.map((c) => c.slug)]))
    }
  }

  useEffect(() => {
    if (!on) return
    let cancelled = false
    fetchCards()
      .then((catalog) => {
        if (!cancelled) setBySlug((prev) => withLocations(prev, catalog.cards))
      })
      // Pins from the radar still arrive; the catalog is retried next switch-on.
      .catch((e) => console.warn('[cards] catalog', e))
    return () => {
      cancelled = true
    }
  }, [on])

  const cards = useMemo(() => [...bySlug.values()], [bySlug])
  return { cards: on ? cards : NO_CARDS, fresh: on ? fresh : EMPTY_SET }
}
