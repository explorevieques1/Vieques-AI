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
  fetchStayCategories,
  fetchStays,
  fetchTrails,
  fetchTransportCategories,
  fetchTransportListings,
  ApiError,
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
  stayToPlace,
  trailToPlace,
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
  /**
   * Whatever made the panel empty, if anything.
   *
   * The sidebars this hook replaced each rendered their own fetch error; the
   * first version of this hook only console.error'd, so a 402 or a dead backend
   * looked identical to "this category genuinely has nothing" — which is how a
   * tier-gating bug on /api/restaurant-categories stayed invisible. Failures
   * must reach the UI.
   */
  error: ApiError | Error | null
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
  const [subCache, setSubCache] = useState<{
    category: CategorySlug
    rows: Subcategory[]
    error: ApiError | Error | null
  } | null>(null)
  const [cache, setCache] = useState<{
    key: string
    rows: Place[]
    error: ApiError | Error | null
  } | null>(null)

  const subFresh = category != null && subCache?.category === category
  const subcategories = subFresh ? subCache!.rows : []

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

  // A failed subcategory fetch is the more fundamental problem — without the
  // chips there is nothing to pick, so report it ahead of any listing error.
  const error = (subFresh ? subCache!.error : null) ?? (fresh ? cache!.error : null)

  // --- subcategory list, once per category ---------------------------------
  useEffect(() => {
    if (!category) return
    const meta = categoryMeta(category)
    // `optionalSubcategories` (stays) fetches chips the same way; the only
    // difference is downstream, in `shouldFetch` — the listings do not wait.
    if (!meta.hasSubcategories && !meta.optionalSubcategories) return
    let cancelled = false
    const load = {
      restaurants: fetchRestaurantCategories,
      activities: fetchActivityCategories,
      services: fetchServiceCategories,
      transportation: fetchTransportCategories,
      essentials: fetchEssentialCategories,
      stays: fetchStayCategories,
    }[category as string]
    if (!load) return
    load()
      .then((rows: Subcategory[]) => {
        if (!cancelled) setSubCache({ category, rows, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error(`Failed to load ${category} categories:`, err)
        setSubCache({ category, rows: [], error: err as Error })
      })
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
      if (!cancelled) setCache({ key: requestKey, rows, error: null })
    }
    const fail = (err: unknown) => {
      if (cancelled) return
      console.error(`Failed to load ${category}:`, err)
      // Cache the failure too — otherwise `loading` stays true forever on a
      // failed request and the list spins with no explanation.
      setCache({ key: requestKey, rows: [], error: err as Error })
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

      // No subcategory to *wait* on — the whole island's lodging is one
      // request, same as beaches. The chip row is a filter over that list, so
      // `subSlug` is passed when set and the null case is the default view.
      case 'stays':
        fetchStays(subSlug).then((rows) => finish(rows.map(stayToPlace)), fail)
        break

      case 'activities':
        // Two activity subcategories are backed by their own table rather than
        // activity_listings, so they branch before the generic fetch. Both
        // still appear as ordinary chips — the `activity_categories` rows
        // ('snorkeling', 'hiking') exist purely to put them in the chip row;
        // nothing joins them to a listing.

        // Snorkelling is its own dataset (spots + zone polygons), not an
        // activity listing. Gate it before the request so a free-tier user
        // gets the upsell instead of a 402 in the console.
        if (subSlug === 'snorkeling') {
          fetchSnorkelSpots().then((rows) => finish(rows.map(snorkelToPlace)), fail)
          break
        }
        // Hiking returns a GeoJSON FeatureCollection rather than an array of
        // rows — the `.features` unwrap is the whole difference, because
        // trailToPlace lifts the metadata out of `properties` and hands the
        // LineString through as Place.geometry for the trail line layer.
        if (subSlug === 'hiking') {
          fetchTrails().then((fc) => finish(fc.features.map(trailToPlace)), fail)
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

  return { places, subcategories, loading, locked, error }
}
