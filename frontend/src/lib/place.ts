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
  TransportListing,
} from './api'
import {
  ACTIVITY_ICONS,
  BEACH_ICON,
  DEFAULT_ICON,
  ESSENTIAL_ICONS,
  SERVICE_ICONS,
  type MarkerStyle,
} from './markerIcon'

export type PlaceKind =
  | 'beach'
  | 'restaurant'
  | 'activity'
  | 'service'
  | 'transport'
  | 'essential'
  | 'snorkel'

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
  /** Drives the detail panel's stat grid. Render the first four. */
  stats: PlaceStat[]
  description?: string
  /** Amber callout, e.g. the wildlife-refuge warning + gate hours. */
  warning?: string
  contact: PlaceContact
  icon: MarkerStyle
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
  /** Rendered instead of a list when there's no backend for this category yet. */
  comingSoon?: boolean
}

export const CATEGORIES: CategoryMeta[] = [
  { slug: 'beaches', label: 'Beaches', hasSubcategories: false },
  { slug: 'restaurants', label: 'Restaurants', hasSubcategories: true },
  { slug: 'activities', label: 'Activities', hasSubcategories: true },
  // No `stays` table or endpoint exists yet — show an honest empty state
  // rather than a blank panel.
  { slug: 'stays', label: 'Stays', hasSubcategories: false, comingSoon: true },
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
  l: Partial<ServiceListing & RestaurantListing & ActivityListing>,
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
