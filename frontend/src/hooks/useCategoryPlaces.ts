import { useEffect, useState } from 'react'

import {
  fetchActivityCategories,
  fetchActivityListings,
  fetchTopActivities,
  fetchBeaches,
  fetchEssentialCategories,
  fetchEssentialListings,
  fetchKayakSpots,
  fetchRestaurantCategories,
  fetchAllRestaurants,
  fetchRestaurantListings,
  fetchServiceCategories,
  fetchServiceListings,
  fetchSnorkelSpots,
  fetchStayCategories,
  fetchStays,
  fetchTopStays,
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
  kayakToPlace,
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

/**
 * Beach chips — values of `beaches.type`, picked for having 3+ beaches each
 * (swimming 8, secluded 6, snorkeling 6, family 5, scenic 5, hiking 3 as of
 * 2026-11-14). Singletons (surfing, camping…) would be a chip per beach.
 */
const BEACH_SUBCATEGORIES: Subcategory[] = [
  { slug: 'swimming', label: 'Swimming' },
  { slug: 'snorkeling', label: 'Snorkeling' },
  { slug: 'family', label: 'Family' },
  { slug: 'secluded', label: 'Secluded' },
  { slug: 'scenic', label: 'Scenic' },
  { slug: 'hiking', label: 'Hike-in' },
]

/**
 * The beaches "Top" chip, in order. Editorial — beaches have no rank column.
 * Matched on the exact `beaches.name`; any name that stops matching is
 * skipped and the 5 are topped up alphabetically, so a rename never empties it.
 */
const TOP_BEACHES = [
  'Playa Caracas (Red Beach)',
  'Playa La Chiva (Blue Beach)',
  'Sun Bay (Balneario Sombe)',
  'Playa Navio',
  'Playa Negra',
]

function topBeaches(all: Place[]): Place[] {
  const picked = TOP_BEACHES.map((n) => all.find((p) => p.name === n)).filter(
    (p): p is Place => p != null,
  )
  const rest = all
    .filter((p) => !picked.includes(p))
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...picked, ...rest].slice(0, 5)
}

/**
 * Activity subcategories backed by their own spots+zones dataset and gated at
 * Vacation tier. Kept as a set so the `locked` check and the fetch branches
 * below cannot drift apart — adding a third water activity means adding its
 * slug here and one fetch branch, not hunting for every `=== 'snorkeling'`.
 *
 * Also decides who gets the "Book a Tour" half of the toggle: these are the
 * subs where a spots dataset and tour companies both exist, so the toggle has
 * two real sides. MapView's `waterActivity` mirrors this for rendering.
 */
const WATER_SUBS = new Set(['snorkeling', 'kayaking'])

type Result = {
  places: Place[]
  subcategories: Subcategory[]
  loading: boolean
  /** Set when snorkelling was requested without the entitlement for it. */
  locked: boolean
  /**
   * The sub-category actually shown: the user's pick, or — for categories that
   * gate on a pick (services, transportation, essentials) — the first chip, so
   * the panel never opens empty. Highlight THIS, not the raw pick.
   */
  activeSub: string | null
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
/**
 * Categories with no "every listing" endpoint — `/api/restaurants` and
 * `/api/activities` are the Top 5, the rest only list per slug. "All" for these
 * is the union of every chip's list. Safe because every active restaurant and
 * activity listing is linked to at least one category (checked 2026-11-17);
 * services/essentials/transport carry one category each by schema.
 */
const MERGED_CATEGORIES = new Set<CategorySlug>([
  'restaurants',
  'activities',
  'services',
  'essentials',
  'transportation',
])

/** Every listing in a category, de-duplicated by Place id (first chip wins). */
async function fetchEverything(
  category: CategorySlug,
  subs: Subcategory[],
  canWaterZones: boolean,
): Promise<Place[]> {
  const perSub = <T,>(fetch: (slug: string) => Promise<T[]>, toPlace: (row: T, slug: string) => Place) =>
    subs.map((s) => fetch(s.slug).then((rows) => rows.map((r) => toPlace(r, s.slug))))

  let groups: Promise<Place[]>[]
  switch (category) {
    case 'beaches':
      groups = [fetchBeaches().then((rows) => rows.map(beachToPlace))]
      break
    case 'stays':
      groups = [fetchStays().then((rows) => rows.map(stayToPlace))]
      break
    case 'restaurants':
      groups = perSub(fetchRestaurantListings, (r) => restaurantToPlace(r))
      break
    case 'activities':
      // Operators under every chip, plus the three chips backed by their own
      // tables. Water spots only with the tier — same gate as the chips.
      groups = [
        // Without the water tier the snorkel/kayak chips are locked, tours
        // included — All must not show what the chips wouldn't.
        ...perSub(fetchActivityListings, activityToPlace).filter(
          (_, i) => canWaterZones || !WATER_SUBS.has(subs[i].slug),
        ),
        fetchTrails().then((fc) => fc.features.map(trailToPlace)),
        ...(canWaterZones
          ? [
              fetchSnorkelSpots().then((rows) => rows.map(snorkelToPlace)),
              fetchKayakSpots().then((rows) => rows.map(kayakToPlace)),
            ]
          : []),
      ]
      break
    case 'services':
      groups = perSub(fetchServiceListings, serviceToPlace)
      break
    case 'essentials':
      groups = perSub(fetchEssentialListings, essentialToPlace)
      break
    case 'transportation':
      groups = perSub(fetchTransportListings, transportToPlace)
      break
    default:
      groups = []
  }

  // One flaky chip shouldn't blank the whole view: keep whatever loaded, and
  // only fail (with the first error) when nothing did.
  const settled = await Promise.allSettled(groups)
  const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (groups.length > 0 && ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason

  const byId = new Map<string, Place>()
  for (const p of ok.flat()) if (!byId.has(p.id)) byId.set(p.id, p)
  return [...byId.values()]
}

export function useCategoryPlaces(
  category: CategorySlug | null,
  pickedSub: string | null,
  /**
   * Vacation-tier water content — snorkelling AND kayaking (PRICING.md §4).
   * Skip the fetch without it so a free-tier user gets the upsell rather than a
   * 402 in the console.
   *
   * One flag rather than one per activity because both sit at the same tier by
   * construction: `snorkel_zones` and `kayak_zones` are both rank 2 in
   * 0033_kayaking.sql and both in the `vacation` bundle in payments.js. If they
   * ever diverge, this splits into two booleans and WATER_SUBS goes with it.
   */
  canWaterZones: boolean,
  /**
   * Which half of the "Go Yourself / Book a Tour" toggle is active.
   *
   * These are two different datasets, not one list filtered two ways: 'all'
   * fetches the activity's own spots table (places you paddle or swim to),
   * 'tours' fetches the activity listings tagged with that slug (companies
   * that take you). It is an argument to the hook rather than a filter in
   * MapView because the answer changes what gets *requested* — the old
   * client-side `offers_tours` filter could only ever show spots, which is why
   * "Book a Tour" listed snorkel spots.
   *
   * Ignored for everything except the WATER_SUBS activities.
   */
  tourFilter: 'all' | 'tours' = 'all',
  /**
   * Server-side beach filters.
   *
   * Unused by the UI — beaches narrow by type with the glass chip row
   * (BEACH_SUBCATEGORIES, filtered in memory). Kept because
   * /api/beaches still implements them and its `facilities` matching is an
   * array-overlap + ILIKE query no client pass can reproduce over trimmed
   * free-tier columns; a future "filter on the server for big result sets" path
   * starts here rather than from nothing.
   */
  beachFilters: BeachFilters = {},
  /**
   * The "Sort: All" view — every listing in the category at once, ignoring the
   * chip pick, so the owner can see the whole dataset on the map. The pick is
   * kept (not cleared) so cycling back out of All returns to the same chip.
   */
  showAll = false,
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
  // Derived, not set from an effect: no extra render, and the default's fetch
  // starts on the same render the chips arrive.
  const subSlug = showAll
    ? null
    : (pickedSub ??
      (category && categoryMeta(category).hasSubcategories ? (subcategories[0]?.slug ?? null) : null))

  // Entitlement is known synchronously, so this is derived rather than state.
  const locked =
    category === 'activities' && WATER_SUBS.has(subSlug ?? '') && !canWaterZones

  const meta = category ? categoryMeta(category) : null
  const shouldFetch =
    category != null &&
    !locked &&
    !meta!.comingSoon &&
    (showAll
      ? // "All" merges every chip's list, so it waits for the chip list itself.
        !MERGED_CATEGORIES.has(category) || subFresh
      : !(meta!.hasSubcategories && !subSlug))

  // `tourFilter` is part of the key: it selects a different endpoint, so
  // leaving it out would serve spots from cache after a toggle to tours.
  const requestKey = showAll
    ? // Chip slugs only matter where All is built from them; for beaches/stays
      // they'd change the key mid-load and fetch the same list twice.
      `${category}|*all*|${
        category && MERGED_CATEGORIES.has(category) ? subcategories.map((s) => s.slug).join(',') : ''
      }|${canWaterZones}`
    : `${category}|${subSlug}|${tourFilter}|${JSON.stringify(beachFilters)}`
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
      beaches: async () => BEACH_SUBCATEGORIES,
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

    if (showAll) {
      fetchEverything(category!, subcategories, canWaterZones).then(finish, fail)
      return () => {
        cancelled = true
      }
    }

    switch (category) {
      case 'beaches':
        // One request for every beach; the chip narrows it here (type values
        // are case-inconsistent in the data — 'Camping' — so compare lowered).
        fetchBeaches(beachFilters).then((rows) => {
          const all = rows.map(beachToPlace)
          finish(
            subSlug
              ? all.filter((p) => p.tags.some((t) => t.toLowerCase() === subSlug))
              : topBeaches(all),
          )
        }, fail)
        break

      // No sub picked = the "Top" chip: the top 5 restaurants, sponsors first (backend/featured.js).
      case 'restaurants':
        (subSlug ? fetchRestaurantListings(subSlug) : fetchAllRestaurants()).then(
          (rows) => finish(rows.map(restaurantToPlace)),
          fail,
        )
        break

      // No subcategory to *wait* on — the whole island's lodging is one
      // request, same as beaches. The chip row is a filter over that list, so
      // `subSlug` is passed when set and the null case is the default view.
      case 'stays':
        (subSlug ? fetchStays(subSlug) : fetchTopStays()).then((rows) => finish(rows.map(stayToPlace)), fail)
        break

      case 'activities':
        // No sub picked = the "Top" chip: 5 operators, paid sponsors first.
        // 'adventures' is only the icon fallback (activityToPlace keys icons
        // by sub slug).
        if (!subSlug) {
          fetchTopActivities().then(
            (rows) => finish(rows.map((r) => activityToPlace(r, 'adventures'))),
            fail,
          )
          break
        }
        // Three activity subcategories are backed by their own table rather
        // than activity_listings, so they branch before the generic fetch. All
        // still appear as ordinary chips — the `activity_categories` rows
        // ('snorkeling', 'hiking', 'kayaking') exist purely to put them in the
        // chip row; nothing joins them to a listing.

        // "Book a Tour", for either water activity.
        //
        // The toggle picks the dataset, not a filter over one dataset. The
        // tours half is the ordinary activity directory filtered to companies
        // tagged with that activity, which is why it goes through the same
        // fetch every other subcategory uses — no special endpoint, and no
        // per-activity operators table. One company can be tagged snorkeling
        // AND kayaking AND bio-bay, so Abes appears under all three with one
        // shared record: db/migrations/0038_activity_multi_category.sql.
        //
        // Ahead of the spots branches below because for these two subs the
        // answer is the same, and duplicating it once per activity is how the
        // snorkel-only version drifted in the first place.
        if (WATER_SUBS.has(subSlug!) && tourFilter === 'tours') {
          fetchActivityListings(subSlug!).then(
            (rows) => finish(rows.map((r) => activityToPlace(r, subSlug!))),
            fail,
          )
          break
        }

        // "Go Yourself" — each water activity's own dataset (spots + zone
        // polygons), not activity listings. Gated before the request so a
        // free-tier user gets the upsell instead of a 402 in the console.
        if (subSlug === 'snorkeling') {
          fetchSnorkelSpots().then((rows) => finish(rows.map(snorkelToPlace)), fail)
          break
        }
        // Kayaking is the same shape as snorkelling — put-in pins with hazard
        // and route polygons (db/migrations/0033_kayaking.sql) — and gated the
        // same way, so it takes the same branch.
        if (subSlug === 'kayaking') {
          fetchKayakSpots().then((rows) => finish(rows.map(kayakToPlace)), fail)
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

  return { places, subcategories, loading, locked, error, activeSub: subSlug }
}
