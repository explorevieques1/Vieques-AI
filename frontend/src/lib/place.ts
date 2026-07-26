// One shape to rule the map UI.
//
// The backend exposes seven unrelated listing types (Beach, RestaurantListing,
// ActivityListing, ServiceListing, TransportListing, EssentialListing,
// SnorkelSpot), and the old UI grew one sidebar and one detail panel per type —
// the same header/rows/close-button markup copied seven ways.
//
// `Place` is a *view model*: a lossy, presentation-shaped projection that every
// results card and the single detail panel consume. The adapters below are the
// only code that knows a Beach from a RestaurantListing. Nothing here touches
// the API or DB schema; `raw` carries the original through for the rare
// kind-specific branch.

import type {
  ActivityListing,
  Beach,
  EssentialListing,
  RestaurantListing,
  ServiceListing,
  SnorkelSpot,
  StayListing,
  TrailFeature,
  TransportListing,
} from './api'
import {
  ACTIVITY_ICONS,
  BEACH_ICON,
  DEFAULT_ICON,
  ESSENTIAL_ICONS,
  SERVICE_ICONS,
  STAY_ICON,
  TRAIL_ICON,
  type MarkerStyle,
} from './markerIcon'

export type PlaceKind =
  | 'beach'
  | 'restaurant'
  | 'stay'
  | 'activity'
  | 'service'
  | 'transport'
  | 'essential'
  | 'snorkel'
  | 'trail'

/** A label/value pair rendered in the detail panel's 2x2 stat grid. */
export type PlaceStat = { label: string; value: string }

export type PlaceContact = {
  phones?: string[]
  website?: string | null
  email?: string | null
  address?: string | null
  hours?: string | null
}

export type Place = {
  /** `${kind}:${rawId}` — ids are only unique per table, so namespace them. */
  id: string
  kind: PlaceKind
  name: string
  /** local_name / cuisine / location_area — the grey line under the title. */
  subtitle?: string
  latitude: number | null
  longitude: number | null
  /** Pill tags: beach types, cuisine, price, vehicle type. */
  tags: string[]
  /** Drives the detail panel's stat grid. Capped by `statLimit`. */
  stats: PlaceStat[]
  /**
   * How many stats the detail panel renders. Four is right for a point listing
   * — past that the grid pushes the description below the fold for no gain.
   * Trails legitimately have more that a hiker needs before setting out
   * (distance, difficulty, time, elevation, surface, route type, shade), so
   * they raise it rather than every category silently growing a longer grid.
   */
  statLimit?: number
  description?: string
  /** Amber callout, e.g. the wildlife-refuge warning + gate hours. */
  warning?: string
  contact: PlaceContact
  icon: MarkerStyle
  /**
   * The drawn shape, for places that are a line rather than a point (trails).
   * `latitude`/`longitude` still hold a representative point — the trailhead —
   * so search, distance sorting, selection and routing keep working unchanged;
   * this is purely what the map draws in addition to the pin.
   */
  geometry?: { type: 'LineString'; coordinates: [number, number][] }
  raw: unknown
}

/** True when this place can be shown on the map (taxis, for one, cannot). */
export function isMappable(p: Place): p is Place & { latitude: number; longitude: number } {
  return p.latitude != null && p.longitude != null
}

// ---------------------------------------------------------------------------
//  Top-level categories
// ---------------------------------------------------------------------------

export type CategorySlug =
  | 'beaches'
  | 'restaurants'
  | 'activities'
  | 'stays'
  | 'services'
  | 'transportation'
  | 'essentials'

export type CategoryMeta = {
  slug: CategorySlug
  label: string
  /**
   * Categories whose listings live behind a subcategory (`/api/restaurants/:slug`).
   * Beaches load in one shot; the rest need a subcategory picked first.
   */
  hasSubcategories: boolean
  /**
   * Chips that filter an already-loaded list instead of gating it.
   *
   * `hasSubcategories` means "there is nothing to show until you pick one".
   * Stays want the chip row without that bargain: the whole island's lodging is
   * one request, so the panel opens with every property and the chips narrow
   * it — with an "All" chip to widen it back (see ResultsList).
   */
  optionalSubcategories?: boolean
  /** Rendered instead of a list when there's no backend for this category yet. */
  comingSoon?: boolean
}

export const CATEGORIES: CategoryMeta[] = [
  { slug: 'beaches', label: 'Beaches', hasSubcategories: false },
  { slug: 'restaurants', label: 'Restaurants', hasSubcategories: true },
  // Hiking lives here as the `hiking` subcategory, not as its own top-level
  // pill: it is a thing to do on the island, and the fact that its rows happen
  // to be lines rather than pins is a rendering detail, not a reason to split
  // the navigation. See the `activities` case in hooks/useCategoryPlaces.ts —
  // it takes the same "this sub has its own dataset" branch snorkelling does.
  { slug: 'activities', label: 'Activities', hasSubcategories: true },
  // Lodging loads in one shot like beaches — there are ~6 properties
  // island-wide — but carries a chip row over the top of that list
  // (stay_categories, 0028) so "we want an eco retreat" is one tap rather than
  // a read of every card's tags.
  { slug: 'stays', label: 'Stays', hasSubcategories: false, optionalSubcategories: true },
  { slug: 'services', label: 'Services', hasSubcategories: true },
  { slug: 'transportation', label: 'Transportation', hasSubcategories: true },
  { slug: 'essentials', label: 'Essentials', hasSubcategories: true },
]

export function categoryMeta(slug: CategorySlug): CategoryMeta {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0]
}

// ---------------------------------------------------------------------------
//  Adapters
// ---------------------------------------------------------------------------

/** Drop nullish/empty entries so a stat grid never renders "Region —". */
function stats(...rows: [string, string | null | undefined][]): PlaceStat[] {
  return rows
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }))
}

function contactOf(
  l: Partial<ServiceListing & RestaurantListing & ActivityListing & StayListing>,
): PlaceContact {
  return {
    phones: l.phones?.length ? l.phones : undefined,
    website: l.website ?? undefined,
    email: l.email ?? undefined,
    address: l.address ?? undefined,
    hours: l.hours ?? undefined,
  }
}

export function beachToPlace(b: Beach): Place {
  return {
    id: `beach:${b.id}`,
    kind: 'beach',
    name: b.name,
    subtitle: [b.local_name, b.region].filter(Boolean).join(' · ') || undefined,
    latitude: b.latitude,
    longitude: b.longitude,
    tags: b.type ?? [],
    stats: stats(
      ['Water', b.water_conditions],
      ['Access', b.access],
      ['Best for', b.best_for],
      ['Facilities', b.facilities?.join(', ')],
      ['Region', b.region],
    ),
    description: b.notes ?? undefined,
    warning: b.in_wildlife_refuge
      ? `Inside the wildlife refuge${
          b.gate_hours && b.gate_hours !== 'N/A' ? ` · ${b.gate_hours}` : ''
        }`
      : undefined,
    contact: {},
    icon: BEACH_ICON,
    raw: b,
  }
}

export function restaurantToPlace(r: RestaurantListing): Place {
  return {
    id: `restaurant:${r.id}`,
    kind: 'restaurant',
    name: r.name,
    subtitle: [r.cuisine, r.location_area].filter(Boolean).join(' · ') || undefined,
    latitude: r.latitude,
    longitude: r.longitude,
    tags: [r.cuisine, r.price].filter((t): t is string => !!t),
    stats: stats(
      ['Cuisine', r.cuisine],
      ['Price', r.price],
      ['Hours', r.hours],
      ['Area', r.location_area],
    ),
    description: r.description ?? undefined,
    contact: contactOf(r),
    icon: { emoji: '🍽️', color: '#f97316' },
    raw: r,
  }
}

/** `air_conditioning` → `Air conditioning`. The DB stores machine keys; the
 *  pills are read by people. */
function amenityLabel(a: string): string {
  const words = a.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "$185–340" / "$185+" / "$185" — whichever the row can actually support. */
function nightlyRange(min: number | null, max: number | null, currency: string): string | null {
  const sym = currency === 'USD' ? '$' : `${currency} `
  if (min == null && max == null) return null
  if (min != null && max != null) {
    return min === max ? `${sym}${min}` : `${sym}${min}–${max}`
  }
  return min != null ? `${sym}${min}+` : `up to ${sym}${max}`
}

export function stayToPlace(s: StayListing): Place {
  const nightly = nightlyRange(s.nightly_min, s.nightly_max, s.currency)

  // The amber callout is for "know this or your trip goes wrong" — on trails it
  // carries unstable ruins and no water. A minimum-night policy is not that; it
  // is booking arithmetic, and it lives in the stat grid below. Putting it here
  // also read as a contradiction whenever price_note already qualified it
  // ("3-night minimum in high season" next to "2-night minimum").
  //
  // What does belong: a pin you cannot trust. `Get Directions` routes to these
  // coordinates, so an approximate one on a villa collective spread across the
  // island is a real navigation problem, not a data-quality footnote.
  const caveats = [
    s.price_note,
    s.location_precision === 'approximate' ? s.directions_note || 'Approximate location' : null,
  ].filter(Boolean)

  return {
    id: `stay:${s.id}`,
    kind: 'stay',
    name: s.name,
    subtitle: [s.property_type, s.location_area].filter(Boolean).join(' · ') || undefined,
    latitude: s.latitude,
    longitude: s.longitude,
    // Order matters: PlaceCard shows only the first three, so the list row
    // reads "$$$ · boutique hotel · sleeps 2" while the detail panel — which
    // renders every tag — continues into the amenity pills below it.
    tags: [
      s.price_band,
      s.property_type,
      s.sleeps ? `sleeps ${s.sleeps}` : null,
      ...s.amenities.map(amenityLabel),
    ].filter((t): t is string => !!t),
    stats: stats(
      ['Nightly', nightly ? `${nightly} / night` : null],
      ['Min stay', s.min_nights && s.min_nights > 1 ? `${s.min_nights} nights` : null],
      ['Sleeps', s.sleeps != null ? String(s.sleeps) : null],
      ['Bedrooms', s.bedrooms != null ? String(s.bedrooms) : null],
      ['Bathrooms', s.bathrooms != null ? String(s.bathrooms) : null],
      ['Check-in', s.check_in],
      ['Check-out', s.check_out],
    ),
    // Eight, like trails, and for the same reason: a booking decision turns on
    // price, minimum stay, size and both times at once. Unlike a restaurant
    // there is no second visit to catch what the grid cut off.
    statLimit: 8,
    description: s.description ?? undefined,
    warning: caveats.length ? caveats.join(' · ') : undefined,
    contact: contactOf(s),
    icon: STAY_ICON,
    raw: s,
  }
}

export function activityToPlace(a: ActivityListing, slug: string): Place {
  return {
    id: `activity:${a.id}`,
    kind: 'activity',
    name: a.name,
    subtitle: a.location_area ?? undefined,
    latitude: a.latitude,
    longitude: a.longitude,
    tags: [a.price_info].filter((t): t is string => !!t),
    stats: stats(
      ['Price', a.price_info],
      ['Hours', a.hours],
      ['Area', a.location_area],
      ['Address', a.address],
    ),
    description: a.description ?? undefined,
    contact: contactOf(a),
    icon: ACTIVITY_ICONS[slug] ?? ACTIVITY_ICONS['adventures'],
    raw: a,
  }
}

export function serviceToPlace(s: ServiceListing, slug: string): Place {
  return {
    id: `service:${s.id}`,
    kind: 'service',
    name: s.name,
    subtitle: s.location_area ?? undefined,
    latitude: s.has_location ? s.latitude : null,
    longitude: s.has_location ? s.longitude : null,
    tags: [],
    stats: stats(['Hours', s.hours], ['Area', s.location_area], ['Address', s.address]),
    description: s.description ?? undefined,
    contact: contactOf(s),
    icon: SERVICE_ICONS[slug] ?? DEFAULT_ICON,
    raw: s,
  }
}

export function essentialToPlace(e: EssentialListing, slug: string): Place {
  return {
    ...serviceToPlace(e, slug),
    id: `essential:${e.id}`,
    kind: 'essential',
    icon: ESSENTIAL_ICONS[slug] ?? DEFAULT_ICON,
  }
}

export function transportToPlace(t: TransportListing, slug: string): Place {
  const vehicleType = typeof t.metadata?.vehicle_type === 'string' ? t.metadata.vehicle_type : null
  const passengers = typeof t.metadata?.passengers === 'number' ? t.metadata.passengers : null
  return {
    id: `transport:${t.id}`,
    kind: 'transport',
    name: t.name,
    subtitle: t.location_area ?? undefined,
    latitude: t.has_location ? t.latitude : null,
    longitude: t.has_location ? t.longitude : null,
    tags: [vehicleType, passengers ? `${passengers} seats` : null].filter(
      (x): x is string => !!x,
    ),
    stats: stats(
      ['Vehicle', vehicleType],
      ['Seats', passengers != null ? String(passengers) : null],
      ['Hours', t.hours],
      ['Fleet', t.vehicles?.length ? `${t.vehicles.length} vehicles` : null],
    ),
    description: t.description ?? undefined,
    contact: contactOf(t),
    icon: slug === 'taxis' ? { emoji: '🚕', color: '#eab308' } : { emoji: '🚗', color: '#0ea5e9' },
    raw: t,
  }
}

// --- trails ----------------------------------------------------------------

const ROUTE_TYPE_LABELS: Record<string, string> = {
  out_and_back: 'Out & back',
  loop: 'Loop',
  point_to_point: 'Point to point',
}

/**
 * Walking time when the trail has no authored `est_minutes`.
 *
 * Naismith's rule: 12 min per km on the flat, plus 10 min per 100 m of climb.
 * Returned separately from an authored time so the UI can mark it "≈" — a
 * guess presented as a fact is worse than no number on a trail with no shade
 * and no water.
 */
function naismithMinutes(km: number, ascentM: number | null): number {
  return Math.max(5, Math.round(km * 12 + ((ascentM ?? 0) / 100) * 10))
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function trailToPlace(f: TrailFeature): Place {
  const t = f.properties
  const km = t.distance_km ?? 0
  const mi = t.distance_mi

  // Authored time wins; otherwise estimate and say so.
  const estimated = t.est_minutes == null
  const minutes = t.est_minutes ?? naismithMinutes(km, t.elevation_gain_m)

  // The refuge warning and the trail's own hazard note are both worth showing
  // and are independent — a trail can be outside the refuge and still have no
  // water. Join rather than letting one shadow the other.
  const warnings = [
    t.in_wildlife_refuge
      ? `Inside the wildlife refuge${t.gate_hours ? ` · ${t.gate_hours}` : ''}`
      : null,
    t.warning,
  ].filter(Boolean)

  return {
    id: `trail:${t.id}`,
    kind: 'trail',
    name: t.name,
    subtitle:
      [t.local_name, t.region].filter(Boolean).join(' · ') ||
      undefined,
    // The trailhead, not the midpoint: it is where you park, and it is what
    // "3.2mi away" and Get Directions should both mean.
    latitude: t.trailhead_lat,
    longitude: t.trailhead_lng,
    tags: [
      mi != null ? `${mi} mi` : null,
      t.difficulty,
      t.route_type ? ROUTE_TYPE_LABELS[t.route_type] : null,
    ].filter((x): x is string => !!x),
    stats: stats(
      ['Distance', mi != null ? `${mi} mi · ${km.toFixed(1)} km` : null],
      ['Difficulty', t.difficulty],
      ['Time', `${estimated ? '≈ ' : ''}${formatDuration(minutes)}`],
      ['Elevation gain', t.elevation_gain_m != null ? `${Math.round(t.elevation_gain_m)} m` : null],
      ['Surface', t.surface],
      ['Route', t.route_type ? ROUTE_TYPE_LABELS[t.route_type] : null],
      ['Shade', t.shade],
      ['Dogs', t.dogs_allowed == null ? null : t.dogs_allowed ? 'Allowed' : 'Not allowed'],
      ['Best time', t.best_time],
    ),
    statLimit: 8,
    description: t.description ?? undefined,
    warning: warnings.length ? warnings.join(' · ') : undefined,
    contact: { website: t.source_url ?? undefined },
    icon: TRAIL_ICON,
    geometry: f.geometry,
    raw: t,
  }
}

export function snorkelToPlace(s: SnorkelSpot): Place {
  return {
    id: `snorkel:${s.id}`,
    kind: 'snorkel',
    name: s.name,
    subtitle: s.difficulty ? `Difficulty · ${s.difficulty}` : undefined,
    latitude: s.latitude,
    longitude: s.longitude,
    tags: [s.difficulty, s.offers_tours ? 'tours' : null].filter((t): t is string => !!t),
    stats: stats(['Difficulty', s.difficulty], ['Entry', s.entry_notes]),
    description: s.description ?? undefined,
    contact: {},
    icon: ACTIVITY_ICONS['snorkeling'],
    raw: s,
  }
}
