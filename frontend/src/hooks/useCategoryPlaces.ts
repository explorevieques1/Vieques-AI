import { useEffect, useState } from 'react'

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
  fetchSnorkelSpots,
  fetchTransportCategories,
  fetchTransportListings,
  type BeachFilters,
} from '../lib/api'
import {
  activityToPlace,
  beachToPlace,
  categoryMeta,
  essentialToPlace,
  restaurantToPlace,
  serviceToPlace,
  snorkelToPlace,
  transportToPlace,
  type CategorySlug,
  type Place,
} from '../lib/place'

export type Subcategory = { slug: string; label: string }

type Result = {
  places: Place[]
  subcategories: Subcategory[]
  loading: boolean
  /** Set when snorkelling was requested without the entitlement for it. */
  locked: boolean
}

/**
 * Everything the results list needs for one (category, subcategory, filters)
 * selection, already projected through the `Place` adapters.
 *
 * This replaces seven near-identical fetch-and-plot effects that used to live
 * in MapView — each one clearing markers, filtering for coordinates, building
 * bounds and calling fitBounds itself. Fetching belongs here; drawing belongs
 * to the caller, which now does it once for any category.
 */
export function useCategoryPlaces(
  category: CategorySlug | null,
  subSlug: string | null,
  beachFilters: BeachFilters,
  /** Snorkelling is Vacation-tier (PRICING.md §4); skip the fetch without it. */
  canSnorkel: boolean,
): Result {
  // Both caches are tagged with the request they answer. Everything the hook
  // returns is then *derived* by comparing that tag to the current request, so
  // switching category shows an empty list on the very same render — no effect
  // that clears state one render late, and no flash of the old category's rows.
  const [subCache, setSubCache] = useState<{ category: CategorySlug; rows: Subcategory[] } | null>(
    null,
  )
  const [cache, setCache] = useState<{ key: string; rows: Place[] } | null>(null)

  const subcategories = category && subCache?.category === category ? subCache.rows : []

  // Entitlement is known synchronously, so this is derived rather than state.
  const locked = category === 'activities' && subSlug === 'snorkeling' && !canSnorkel

  const meta = category ? categoryMeta(category) : null
  const shouldFetch =
    category != null &&
    !locked &&
    !meta!.comingSoon &&
    !(meta!.hasSubcategories && !subSlug)

  const requestKey = `${category}|${subSlug}|${JSON.stringify(beachFilters)}`
  const fresh = cache?.key === requestKey
  const places = shouldFetch && fresh ? cache!.rows : []
  const loading = shouldFetch && !fresh

  // --- subcategory list, once per category ---------------------------------
  useEffect(() => {
    if (!category) return
    const meta = categoryMeta(category)
    if (!meta.hasSubcategories) return
    let cancelled = false
    const load = {
      restaurants: fetchRestaurantCategories,
      activities: fetchActivityCategories,
      services: fetchServiceCategories,
      transportation: fetchTransportCategories,
      essentials: fetchEssentialCategories,
    }[category as string]
    if (!load) return
    load()
      .then((rows: Subcategory[]) => {
        if (!cancelled) setSubCache({ category, rows })
      })
      .catch((err: unknown) => console.error(`Failed to load ${category} categories:`, err))
    return () => {
      cancelled = true
    }
  }, [category])

  // --- the listings themselves ---------------------------------------------
  useEffect(() => {
    // Nothing to request: no category, a coming-soon one, one still waiting on
    // a subcategory pick, or a locked feature. `places`/`loading` already read
    // as empty/idle for all of these, so there is no state to clear here.
    if (!shouldFetch) return

    let cancelled = false
    const finish = (rows: Place[]) => {
      if (!cancelled) setCache({ key: requestKey, rows })
    }
    const fail = (err: unknown) => {
      if (cancelled) return
      console.error(`Failed to load ${category}:`, err)
      // Cache the empty result too — otherwise `loading` stays true forever on
      // a failed request and the list spins with no explanation.
      setCache({ key: requestKey, rows: [] })
    }

    switch (category) {
      case 'beaches':
        fetchBeaches(beachFilters).then((rows) => finish(rows.map(beachToPlace)), fail)
        break

      case 'restaurants':
        fetchRestaurantListings(subSlug!).then(
          (rows) => finish(rows.map(restaurantToPlace)),
          fail,
        )
        break

      case 'activities':
        // Snorkelling is its own dataset (spots + zone polygons), not an
        // activity listing. Gate it before the request so a free-tier user
        // gets the upsell instead of a 402 in the console.
        if (subSlug === 'snorkeling') {
          fetchSnorkelSpots().then((rows) => finish(rows.map(snorkelToPlace)), fail)
          break
        }
        fetchActivityListings(subSlug!).then(
          (rows) => finish(rows.map((r) => activityToPlace(r, subSlug!))),
          fail,
        )
        break

      case 'services':
        fetchServiceListings(subSlug!).then(
          (rows) => finish(rows.map((r) => serviceToPlace(r, subSlug!))),
          fail,
        )
        break

      case 'essentials':
        fetchEssentialListings(subSlug!).then(
          (rows) => finish(rows.map((r) => essentialToPlace(r, subSlug!))),
          fail,
        )
        break

      case 'transportation':
        fetchTransportListings(subSlug!).then(
          (rows) => finish(rows.map((r) => transportToPlace(r, subSlug!))),
          fail,
        )
        break

      default:
        finish([])
    }

    return () => {
      cancelled = true
    }
    // `requestKey` folds in category, subSlug and the beach filters, and
    // `shouldFetch` folds in the entitlement — so re-running on those two is
    // enough, and spots appear right after an upgrade without a page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, shouldFetch])

  return { places, subcategories, loading, locked }
}
