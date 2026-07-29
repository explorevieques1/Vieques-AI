import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchFavorites, removeFavorite, saveFavorite, type FavoriteRow } from '../lib/api'
import { favoriteToPlace, placeSnapshot, type Place } from '../lib/place'

/**
 * The user's saved places.
 *
 * Optimistic, and deliberately so: a heart that waits for a round trip before
 * filling reads as broken on a phone with one bar of LTE, and the cost of being
 * wrong is one icon in the wrong state until the next load. Failure rolls the
 * row back rather than leaving a lie on screen.
 *
 * Signed-out / failed loads resolve to an empty set, not an error. The heart is
 * additive — if saving is unavailable the rest of the app is unaffected.
 */
export type Favorites = {
  /** Place ids, for the O(1) `saved` check every card does. */
  ids: Set<string>
  /** Newest first, ready for a results list. */
  places: Place[]
  loading: boolean
  toggle: (p: Place) => void
}

export function useFavorites(): Favorites {
  const [rows, setRows] = useState<FavoriteRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    fetchFavorites()
      .then((r) => live && setRows(r))
      .catch(() => {
        /* see above — an empty list is the right fallback */
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const ids = useMemo(() => new Set(rows.map((r) => r.place_id)), [rows])
  const places = useMemo(() => rows.map(favoriteToPlace), [rows])

  const toggle = useCallback(
    (p: Place) => {
      const saved = rows.some((r) => r.place_id === p.id)
      const before = rows

      if (saved) {
        setRows((rs) => rs.filter((r) => r.place_id !== p.id))
        removeFavorite(p.id).catch(() => setRows(before))
        return
      }

      // Build the optimistic row from the same snapshot the server will store,
      // so the card does not change shape when the real row arrives.
      const snapshot = placeSnapshot(p)
      const [kind, ...rest] = p.id.split(':')
      setRows((rs) => [
        {
          place_id: p.id,
          place_kind: kind,
          place_ref: rest.join(':'),
          snapshot,
          created_at: new Date().toISOString(),
        },
        ...rs,
      ])
      saveFavorite(p.id, snapshot).catch(() => setRows(before))
    },
    [rows],
  )

  return { ids, places, loading, toggle }
}
