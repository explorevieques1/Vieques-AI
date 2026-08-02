import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchActivityCategories,
  fetchActivityListings,
  fetchBeaches,
  fetchEssentialCategories,
  fetchEssentialListings,
  fetchRestaurantCategories,
  fetchRestaurantListings,
  fetchServiceCategories,
  fetchServiceListings,
  fetchStays,
  fetchTransportCategories,
  fetchTransportListings,
} from '../lib/api'
import {
  activityToPlace,
  beachToPlace,
  essentialToPlace,
  restaurantToPlace,
  serviceToPlace,
  stayToPlace,
  transportToPlace,
  type CategorySlug,
  type Place,
} from '../lib/place'

/**
 * One searchable place plus the category it came from.
 *
 * The category rides along because a cross-category result list has to say
 * where each row lives — "Mango Taphouse" means nothing without "Restaurants"
 * next to it — and because picking a row has to switch the app into that
 * category, which needs the slug.
 */
export type SearchHit = { place: Place; category: CategorySlug; sub: string | null }

export type IslandIndexState = {
  hits: SearchHit[]
  /** Whole-island fetch is in flight. Drives the searching animation. */
  loading: boolean
  /** 0–1, how much of the fan-out has landed. Drives the progress bar. */
  progress: number
  /** The category currently being pulled in, for the "Searching X…" line. */
  stage: CategorySlug | null
  /** True once a full pass has completed, successfully or not. */
  ready: boolean
}

/**
 * Categories that need a subcategory before their listings exist, mapped to
 * the fetchers that enumerate those subcategories and then their rows.
 *
 * This is the whole reason island-wide search needs its own hook rather than
 * reusing useCategoryPlaces. That hook answers "what is in the category the
 * user picked"; five of the seven categories return NOTHING until a
 * subcategory is also picked, so a search that only looked at the current
 * selection could never find a restaurant before the user had already
 * navigated to the exact cuisine it was filed under — which is the search you
 * needed in the first place.
 */
const GATED = {
  restaurants: {
    subs: fetchRestaurantCategories,
    rows: fetchRestaurantListings,
    adapt: (r: unknown) => restaurantToPlace(r as Parameters<typeof restaurantToPlace>[0]),
  },
  activities: {
    subs: fetchActivityCategories,
    rows: fetchActivityListings,
    adapt: (r: unknown, sub: string) =>
      activityToPlace(r as Parameters<typeof activityToPlace>[0], sub),
  },
  services: {
    subs: fetchServiceCategories,
    rows: fetchServiceListings,
    adapt: (r: unknown, sub: string) =>
      serviceToPlace(r as Parameters<typeof serviceToPlace>[0], sub),
  },
  transportation: {
    subs: fetchTransportCategories,
    rows: fetchTransportListings,
    adapt: (r: unknown, sub: string) =>
      transportToPlace(r as Parameters<typeof transportToPlace>[0], sub),
  },
  essentials: {
    subs: fetchEssentialCategories,
    rows: fetchEssentialListings,
    adapt: (r: unknown, sub: string) =>
      essentialToPlace(r as Parameters<typeof essentialToPlace>[0], sub),
  },
} as const

/** Every category the index covers, in the order it walks them. */
const ORDER: CategorySlug[] = [
  'restaurants',
  'beaches',
  'stays',
  'activities',
  'essentials',
  'transportation',
  'services',
]

/**
 * Water subcategories are their own gated datasets (snorkel/kayak spots at
 * Vacation tier) and hiking returns GeoJSON rather than rows. All three are
 * skipped here: the index exists to find a *named place* by typing its name,
 * and a 402 per free-tier user per search is a lot of noise to pay for three
 * subcategories the category pills already reach directly.
 */
const SKIP_SUBS = new Set(['snorkeling', 'kayaking', 'hiking'])

/**
 * An index of every place on the island, fetched once and searched in memory.
 *
 * WHY THIS EXISTS
 * ---------------
 * Search used to run against `places` — whatever the current category had
 * loaded — and was `disabled` outright until a category was picked. So the
 * field could not find anything the user had not already navigated to, which
 * is a search box that only finds what you have found. Typing "Mango Taphouse"
 * on a cold start matched nothing, and on desktop, where the category pills
 * are the only way to load a category, a moment where those pills are
 * unreachable left the app with no usable input at all.
 *
 * WHY CLIENT-SIDE
 * ---------------
 * There is no /api/search — the backend exposes one route per category, each
 * with its own requireTier gate (backend/server.js). Fanning out over those
 * routes keeps every one of those gates exactly as it is: a category the
 * user's tier does not cover 402s, we drop it, and it simply is not in the
 * index. A new cross-category endpoint would have had to re-derive all seven
 * gates server-side, which is the same policy written twice.
 *
 * The fetch is lazy — nothing happens until `start()` is called on first focus
 * — so a user who never touches search never pays for it.
 */
export function useIslandSearch(): IslandIndexState & { start: () => void } {
  const [state, setState] = useState<IslandIndexState>({
    hits: [],
    loading: false,
    progress: 0,
    stage: null,
    ready: false,
  })
  // Guards the fan-out against re-entry: `start` fires on every focus, and
  // without this each one would kick off a fresh sweep of ~30 requests over
  // the top of the last.
  const started = useRef(false)

  const cancelled = useRef(false)
  useEffect(
    () => () => {
      cancelled.current = true
    },
    [],
  )

  const start = useCallback(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      setState((s) => ({ ...s, loading: true, progress: 0 }))
      const all: SearchHit[] = []

      for (let i = 0; i < ORDER.length; i++) {
        const category = ORDER[i]
        if (cancelled.current) return
        setState((s) => ({ ...s, stage: category, progress: i / ORDER.length }))

        try {
          if (category === 'beaches') {
            const rows = await fetchBeaches({})
            rows.forEach((r) => all.push({ place: beachToPlace(r), category, sub: null }))
          } else if (category === 'stays') {
            const rows = await fetchStays(null)
            rows.forEach((r) => all.push({ place: stayToPlace(r), category, sub: null }))
          } else {
            const g = GATED[category as keyof typeof GATED]
            const subs = await g.subs()
            // Sequential rather than Promise.all over every subcategory of
            // every category at once: that is ~30 requests landing together,
            // and the backend pool (server.js) is shared with the map's own
            // fetches. One category at a time also makes `stage` mean
            // something to look at.
            const lists = await Promise.all(
              subs
                .filter((s) => !SKIP_SUBS.has(s.slug))
                .map(async (s) => {
                  try {
                    const rows = await g.rows(s.slug)
                    return rows.map((r) => ({
                      place: g.adapt(r, s.slug),
                      category,
                      sub: s.slug,
                    }))
                  } catch {
                    // One dead subcategory must not lose the other six.
                    return []
                  }
                }),
            )
            lists.forEach((l) => all.push(...(l as SearchHit[])))
          }
        } catch {
          // A 402 here is the expected shape of "this tier does not include
          // this category", not a failure — the category is simply absent from
          // the index, exactly as its panel would be. Anything else (a dead
          // backend) degrades the same way rather than emptying the whole
          // index for one bad route.
        }

        if (cancelled.current) return
        // Publish after each category so results stream in as they land — the
        // list fills while the sweep is still running rather than sitting
        // empty behind a spinner for the whole pass.
        setState((s) => ({ ...s, hits: [...all], progress: (i + 1) / ORDER.length }))
      }

      if (cancelled.current) return
      setState((s) => ({ ...s, loading: false, stage: null, ready: true, progress: 1 }))
    })()
  }, [])

  return { ...state, start }
}

/**
 * Rank matches for `query` against the index.
 *
 * Scored rather than merely filtered so "Mango Taphouse" puts Mango Taphouse
 * first instead of alphabetically among everything else containing "mango" —
 * a prefix match on the name outranks a hit buried in a tag. Every term has to
 * appear somewhere, so typing more words narrows rather than widens.
 */
export function rankHits(hits: SearchHit[], query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/)

  const scored: { hit: SearchHit; score: number }[] = []
  for (const hit of hits) {
    const name = hit.place.name.toLowerCase()
    const subtitle = hit.place.subtitle?.toLowerCase() ?? ''
    const tags = hit.place.tags.join(' ').toLowerCase()
    const haystack = `${name} ${subtitle} ${tags}`

    if (!terms.every((t) => haystack.includes(t))) continue

    let score = 0
    if (name === q) score += 100
    if (name.startsWith(q)) score += 50
    if (name.includes(q)) score += 25
    if (terms.every((t) => name.includes(t))) score += 15
    if (subtitle.includes(q)) score += 6
    if (tags.includes(q)) score += 3
    // Shorter names that still match are the more specific answer.
    score -= Math.min(name.length, 60) / 100

    scored.push({ hit, score })
  }

  scored.sort((a, b) => b.score - a.score || a.hit.place.name.localeCompare(b.hit.place.name))
  return scored.slice(0, limit).map((s) => s.hit)
}
