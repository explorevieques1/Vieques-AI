import { useCallback, useEffect, useState } from 'react'

import { fetchCards, type Card, type CardsCatalog } from '../lib/api'
import { RARITIES } from '../lib/rarity'

/**
 * GET /api/cards for the Collection's entry points and the pane itself
 * (docs/CARD_UI_SPEC.md S-6, S-9): the Menu row's "9 / 24", Profile's
 * "Your collection" line, the Collection header, tallies and grid.
 *
 * Fetches when `enabled` turns true (mounting the Menu, opening the desktop
 * dropdown) and on `reload()`. The last answer is kept while disabled, so a
 * dropdown that closes and reopens doesn't flash an empty count.
 *
 * Unrevealed cards arrive as silhouettes (no name, art or location — P-5);
 * nothing here asks for more.
 */
export type CardsCatalogState = {
  catalog: CardsCatalog | null
  /** The last fetch failed and there is nothing to show. */
  failed: boolean
  reload: () => void
}

export function useCardsCatalog(enabled = true): CardsCatalogState {
  const [catalog, setCatalog] = useState<CardsCatalog | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetchCards()
      .then((c) => {
        if (!alive) return
        setCatalog(c)
        setFailed(false)
      })
      .catch((e) => {
        console.warn('[cards] catalog', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [enabled, reloads])

  const reload = useCallback(() => setReloads((n) => n + 1), [])
  return { catalog, failed, reload }
}

/** Rarest card you own (legendary beats rare beats basic…); first in catalog order on a tie. */
export function rarestOwned(cards: Card[]): Card | null {
  let best: Card | null = null
  let bestRank = -1
  for (const c of cards) {
    if (!c.owned) continue
    const rank = RARITIES.indexOf(c.rarity)
    if (rank > bestRank) {
      best = c
      bestRank = rank
    }
  }
  return best
}
