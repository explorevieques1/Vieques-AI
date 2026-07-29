import { useCallback, useEffect, useState } from 'react'

import { fetchSuggestion, type Suggestion } from '../lib/api'

/** 04:00–11:59 morning · 12:00–16:59 afternoon · 17:00–03:59 evening. */
export type Daypart = 'morning' | 'afternoon' | 'evening'

export function daypart(now = new Date()): Daypart {
  const h = now.getHours()
  if (h >= 4 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  return 'evening'
}

export function greetingFor(part: Daypart): string {
  return part === 'morning'
    ? 'Good morning'
    : part === 'afternoon'
      ? 'Good afternoon'
      : 'Good evening'
}

function cached(key: string): Suggestion | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Suggestion) : null
  } catch {
    return null
  }
}

function remember(key: string, s: Suggestion) {
  try {
    sessionStorage.setItem(key, JSON.stringify(s))
  } catch {
    /* private mode / quota — the suggestion still works, it just reshuffles on
       the next remount */
  }
}

/**
 * Suggestion of the Day.
 *
 * "Of the Day" is a promise about stability, so the first pick is cached in
 * sessionStorage under the date and the daypart. Without that, every remount of
 * the card would reshuffle it and the user would watch the tip they were
 * half-way through reading get replaced. Keyed on the daypart too, so crossing
 * into the evening does refresh it — the copy is written to match.
 *
 * `next()` is the arrow button: an explicit request for a different one, which
 * overwrites the cache.
 */
export function useSuggestion(part: Daypart) {
  const key = `suggestion:${new Date().toISOString().slice(0, 10)}:${part}`
  const [suggestion, setSuggestion] = useState<Suggestion | null>(() => cached(key))
  // Starts true only when there is nothing cached to show — that is exactly when
  // the card needs to say it is working on it.
  const [loading, setLoading] = useState(() => cached(key) == null)

  /** The arrow. Sets `loading` synchronously because a tap should feel answered. */
  const next = useCallback(() => {
    setLoading(true)
    return fetchSuggestion(part)
      .then((s) => {
        setSuggestion(s)
        remember(key, s)
        return s
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [key, part])

  // First load. Deliberately does NOT reuse `next()`: that sets state
  // synchronously, and doing so from an effect body triggers a cascading render.
  // Here every setState is already inside the promise chain.
  useEffect(() => {
    if (cached(key)) return
    let live = true
    fetchSuggestion(part)
      .then((s) => {
        if (!live) return
        setSuggestion(s)
        remember(key, s)
      })
      .catch(() => {
        /* the card renders without a suggestion — see GreetingCard */
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [key, part])

  return { suggestion, loading, next }
}
