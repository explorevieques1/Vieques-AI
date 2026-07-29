// ============================================================================
//  Category-aware filter chips, derived from the loaded result set
// ============================================================================
//
//  The old filter UI was one hardcoded popover that only knew about beaches
//  (TYPES / WATER / FACILITIES literals). Every other category had no filters at
//  all, and beaches' lived in a component rather than in the data.
//
//  This derives the chips from `Place.tags` instead. That field already
//  normalises each category's filterable attributes into one string[] — beach
//  types, cuisine, price band, property type, amenities, trail difficulty — so
//  the same code produces sensible chips for all seven categories with no schema
//  change and no per-category JSX. Beaches keep their server-side filters (the
//  /api/beaches query does array-overlap + ILIKE, which a client-side pass
//  cannot replicate for `facilities`); everything else filters in memory, which
//  is free because the whole category is already loaded.
//
//  TWO THINGS THE RAW TAGS GET WRONG, AND WHY THE NORMALISING EXISTS
//  -----------------------------------------------------------------
//  1. Composite values. `restaurant_listings.cuisine` is freeform prose —
//     "Bar & grill / pizza", "Cafe / waterfront", "Healthy / vegan-friendly".
//     There are 20 distinct values across ~35 rows, so used verbatim almost
//     every restaurant would get its own chip and the row would filter nothing.
//     Splitting on `/` and `&` turns those into `bar`, `grill`, `pizza`,
//     `waterfront`, `vegan-friendly` — values that actually group.
//  2. Case. `beaches.type` is mostly lowercase but contains one 'Camping',
//     which would otherwise sit next to 'camping' as a separate chip.
//
//  Because matching happens on the normalised form, `place.tags.includes(tag)`
//  is NOT a valid test — use `matchesFilters` below.
// ============================================================================

import type { CategorySlug, Place } from './place'
import { ACTIVITY_ICONS, ESSENTIAL_ICONS, SERVICE_ICONS } from './markerIcon'

export type FilterChip = {
  /** The normalised tag value; what goes in the active set. */
  key: string
  label: string
  icon: string
  count: number
  active: boolean
}

/** Split a composite tag into its parts and normalise each one. */
function explode(tag: string): string[] {
  return tag
    .split(/[/&,]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

/** Every normalised filter value a place carries. */
function tagsOf(place: Place): string[] {
  return place.tags.flatMap(explode)
}

/**
 * Values that are descriptive but not groupable — they identify a single place
 * rather than a set of them, so as chips they are noise that pushes the useful
 * ones off the row.
 *
 * The count-based rule below cannot catch these: two stays that both sleep 2
 * would keep "sleeps 2" alive at count 2 forever.
 */
const HIDE_PATTERNS: RegExp[] = [
  /^sleeps \d+/, // stays
  /^\d+(\.\d+)? ?mi$/, // trails — distance, already on the card
  /^\d+ seats?$/, // transport
  /^\$+ ?\/ ?night/, // stays — nightly rate
]

type CategoryConfig = {
  /** Chips to float to the front, in this order. The rest sort by count. */
  order?: string[]
  /** Display overrides; otherwise the key is title-cased. */
  labels?: Record<string, string>
  icons?: Record<string, string>
  hide?: string[]
  max?: number
}

/**
 * Curated per-category shaping. Everything here is presentation — an absent
 * category still works, it just orders purely by frequency.
 */
const FILTER_CONFIG: Partial<Record<CategorySlug, CategoryConfig>> = {
  beaches: {
    order: ['swimming', 'snorkeling', 'family', 'secluded', 'scenic', 'surfing'],
    icons: {
      swimming: '🏊',
      snorkeling: '🤿',
      family: '👨‍👩‍👧',
      secluded: '🤫',
      scenic: '📸',
      surfing: '🏄',
      bodysurfing: '🌊',
      diving: '🤿',
      camping: '⛺',
      hiking: '🥾',
      beachcombing: '🐚',
    },
  },
  restaurants: {
    order: ['seafood', 'local puerto rican', 'bar', 'pizza', 'breakfast', 'waterfront'],
    labels: { 'local puerto rican': 'Puerto Rican', 'contemporary puerto rican': 'Contemporary PR' },
    icons: {
      seafood: '🦐',
      'local puerto rican': '🇵🇷',
      'contemporary puerto rican': '🇵🇷',
      bar: '🍸',
      pizza: '🍕',
      breakfast: '🥐',
      bakery: '🥖',
      waterfront: '🌊',
      burgers: '🍔',
      italian: '🍝',
      cafe: '☕',
      'fine dining': '🍷',
      grill: '🔥',
      'vegan-friendly': '🥗',
      healthy: '🥗',
      caribbean: '🌴',
      american: '🍟',
      snacks: '🍦',
      'frozen treats': '🍦',
      bistro: '🍽️',
      romantic: '🕯️',
    },
  },
  stays: {
    order: ['$', '$$', '$$$', 'boutique hotel', 'guest house', 'villa', 'hostel', 'eco hotel'],
    icons: {
      $: '💵',
      $$: '💵',
      $$$: '💵',
      'boutique hotel': '🏨',
      'eco hotel': '🌿',
      'guest house': '🏡',
      hostel: '🛏️',
      villa: '🏖️',
      pool: '🏊',
      wifi: '📶',
      'air conditioning': '❄️',
      kitchen: '🍳',
      breakfast: '🥐',
      parking: '🅿️',
      'pet friendly': '🐾',
    },
  },
  activities: {
    order: ['easy', 'moderate', 'difficult', 'tours'],
    icons: { easy: '🟢', moderate: '🟡', difficult: '🔴', tours: '🎟️' },
  },
  transportation: {
    icons: { jeep: '🚙', suv: '🚙', sedan: '🚗', van: '🚐', golf: '🏌️', scooter: '🛵' },
  },
}

/** Tags that aren't category-specific — a shared fallback icon table. */
const TAG_ICONS: Record<string, string> = {
  calm: '🌊',
  moderate: '🌊',
  rough: '🌊',
  restroom: '🚻',
  restrooms: '🚻',
  parking: '🅿️',
  shade: '🌴',
  picnic: '🧺',
  loop: '🔄',
  'out and back': '↔️',
  'point to point': '➡️',
}

function iconFor(tag: string, cfg?: CategoryConfig): string {
  return (
    cfg?.icons?.[tag] ??
    ACTIVITY_ICONS[tag]?.emoji ??
    ESSENTIAL_ICONS[tag]?.emoji ??
    SERVICE_ICONS[tag]?.emoji ??
    TAG_ICONS[tag] ??
    '#'
  )
}

function labelFor(tag: string, cfg?: CategoryConfig): string {
  const override = cfg?.labels?.[tag]
  if (override) return override
  // Leave price bands and other non-words alone; title-case real words.
  if (!/[a-z]/.test(tag)) return tag
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}

/**
 * The chip row for a category, given the places currently loaded.
 *
 * Chips are dropped when they would not narrow anything:
 *   - count === 0 (can't happen from this data, but guards a stale active set)
 *   - count === places.length — every result has it, so tapping it is a no-op
 * That second rule is why a category whose rows are all identical shows no
 * filter row at all, rather than a row of chips that do nothing.
 */
export function deriveFilters(
  category: CategorySlug,
  places: Place[],
  active: Set<string>,
): FilterChip[] {
  if (places.length === 0) return []
  const cfg = FILTER_CONFIG[category]

  const counts = new Map<string, number>()
  places.forEach((p) => {
    // Set, so a place whose cuisine is "Bar & grill / bar" counts `bar` once.
    new Set(tagsOf(p)).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
  })

  const hidden = new Set(cfg?.hide ?? [])
  const order = cfg?.order ?? []

  const chips = [...counts.entries()]
    .filter(([tag, n]) => {
      if (hidden.has(tag) || n === 0) return false
      // Keep an active chip even if it now matches everything — removing the
      // control that produced the current view would strand the user in it.
      if (n === places.length && !active.has(tag)) return false
      if (HIDE_PATTERNS.some((re) => re.test(tag))) return false
      return true
    })
    .map(([tag, n]) => ({
      key: tag,
      label: labelFor(tag, cfg),
      icon: iconFor(tag, cfg),
      count: n,
      active: active.has(tag),
    }))

  chips.sort((a, b) => {
    // Active first: they are the state the user is in, and on a scrolling row
    // an active chip parked off screen is an invisible filter.
    if (a.active !== b.active) return a.active ? -1 : 1
    const ia = order.indexOf(a.key)
    const ib = order.indexOf(b.key)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    if (a.count !== b.count) return b.count - a.count
    return a.label.localeCompare(b.label)
  })

  return chips.slice(0, cfg?.max ?? 12)
}

/**
 * Does this place satisfy every active chip?
 *
 * AND, not OR: chips narrow. Picking "seafood" and "waterfront" means you want
 * both, which is the reading that makes a second tap useful rather than a way
 * of widening the list back out.
 *
 * Matches on the normalised/exploded tags — `place.tags.includes(key)` would
 * miss `bar` inside "Bar & grill".
 */
export function matchesFilters(place: Place, active: Set<string>): boolean {
  if (active.size === 0) return true
  const own = new Set(tagsOf(place))
  for (const t of active) if (!own.has(t)) return false
  return true
}
