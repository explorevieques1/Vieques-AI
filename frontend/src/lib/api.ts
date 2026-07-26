import { getSession } from './supabase'

// Talks to the backend API.
// Priority: explicit env override -> same host the page loaded from -> localhost.
// This means it "just works" on localhost, on your phone, or on another computer
// on the same network, without editing .env when you change networks.
const BACKEND_PORT = 3001
function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`
  }
  return `http://localhost:${BACKEND_PORT}`
}
export const API_BASE = resolveApiBase()

/** Where the marketing site lives — sign-in, pricing and checkout all happen there. */
export const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'http://localhost:5174'

// Every route below requires a signed-in user (requireAuth on the backend),
// so every call attaches the current Supabase session token. Without this,
// calls silently 401 for a logged-in user whose session simply wasn't sent.
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await getSession()
  const token = data.session?.access_token
  const headers = { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/**
 * A failed API call, with the backend's structured detail preserved.
 *
 * The old pattern — `throw new Error(msg.error || ...)` — flattened every
 * failure to a string, which meant the UI could not tell "you're out of AI
 * messages" (fixable by upgrading) from "the server broke" (not the user's
 * fault). Both rendered as raw backend prose with no call to action.
 *
 * `code` comes from requireTier / requireCredits in backend/middleware.js:
 *   'UPGRADE_REQUIRED' — plan lacks this feature; `feature` says which
 *   'NO_CREDITS'       — Ask AI allowance exhausted
 */
export class ApiError extends Error {
  status: number
  code?: string
  feature?: string
  remaining?: number

  constructor(status: number, body: Record<string, unknown>, fallback: string) {
    super((body.error as string) || fallback)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code as string | undefined
    this.feature = body.feature as string | undefined
    this.remaining = body.remaining as number | undefined
  }

  /** True when upgrading the user's plan would fix this. */
  get isUpgradeable(): boolean {
    return this.code === 'UPGRADE_REQUIRED' || this.code === 'NO_CREDITS'
  }
}

/** Throw a structured ApiError from a non-OK response. */
async function raise(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new ApiError(res.status, body, `${fallback}: ${res.status}`)
}

// ---------------------------------------------------------------------------
//  Entitlement
// ---------------------------------------------------------------------------

export type Tier = 'free' | 'day_trip' | 'vacation' | 'exploration'

/** One active purchase. A user can hold several (bought Day Trip, then upgraded). */
export type ActivePlan = {
  plan: string
  status: string
  /** Null for open-ended subscription access; a date for time-boxed passes. */
  expires_at: string | null
}

export type Entitlement = {
  /** Holds a paid pass. False for the free tier — which is still allowed in. */
  hasAccess: boolean
  tier: Tier
  /** Feature slugs this tier unlocks; see FEATURES in backend/payments.js. */
  features: string[]
  /** Remaining Ask AI messages (ledger balance). */
  credits: number
  deviceLimit: number
  /** Every active purchase, newest first. Drives the profile page. */
  plans: ActivePlan[]
}

/** What an unknown/failed entitlement resolves to. Fails CLOSED, not open. */
export const FREE_ENTITLEMENT: Entitlement = {
  hasAccess: false,
  tier: 'free',
  features: ['map', 'search', 'beach_names', 'restaurant_preview', 'ai_trial'],
  credits: 0,
  deviceLimit: 1,
  plans: [],
}

/**
 * Ask the backend what this user is entitled to.
 *
 * Previously AccessGate did this with its own raw `fetch` and a duplicated copy
 * of resolveApiBase(); it lives here so there is one API surface and one place
 * that knows the base URL.
 */
export async function fetchEntitlement(): Promise<Entitlement> {
  const res = await apiFetch('/api/entitlement')
  if (!res.ok) await raise(res, 'Entitlement check failed')
  const data = await res.json()
  return { ...FREE_ENTITLEMENT, ...data }
}

export type Beach = {
  id: string
  name: string
  local_name: string | null
  latitude: number
  longitude: number
  region: string | null
  type: string[]
  water_conditions: string | null
  access: string | null
  facilities: string[]
  best_for: string | null
  in_wildlife_refuge: boolean
  gate_hours: string | null
  notes: string | null
  /** Hero photo paths, same contract as StayListing.images. Free tier omits. */
  images?: string[]
  image_credit?: string | null
}

export type BeachFilters = {
  type?: string[]
  water?: string
  refuge?: boolean
  facilities?: string[]
}

export async function fetchBeaches(filters: BeachFilters = {}): Promise<Beach[]> {
  const qs = new URLSearchParams()
  if (filters.type?.length) qs.set('type', filters.type.join(','))
  if (filters.water) qs.set('water', filters.water)
  if (typeof filters.refuge === 'boolean') qs.set('refuge', String(filters.refuge))
  if (filters.facilities?.length) qs.set('facilities', filters.facilities.join(','))
  const q = qs.toString()
  const res = await apiFetch(`/api/beaches${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`Beaches request failed: ${res.status}`)
  return res.json()
}

export type ActivityCategory = { slug: string; label: string }

export type ActivityListing = {
  id: string
  name: string
  description: string | null
  phones: string[]
  website: string | null
  address: string | null
  location_area: string | null
  latitude: number | null
  longitude: number | null
  price_info: string | null
  hours: string | null
}

export async function fetchActivityCategories(): Promise<ActivityCategory[]> {
  const res = await apiFetch(`/api/activity-categories`)
  if (!res.ok) throw new Error(`Activity categories failed: ${res.status}`)
  return res.json()
}

export async function fetchActivityListings(slug: string): Promise<ActivityListing[]> {
  const res = await apiFetch(`/api/activities/${slug}`)
  if (!res.ok) throw new Error(`Activity listings failed: ${res.status}`)
  return res.json()
}

export type SnorkelSpot = {
  id: string
  name: string
  beach_id: string | null
  description: string | null
  difficulty: string | null
  entry_notes: string | null
  latitude: number
  longitude: number
  offers_tours: boolean
}

export type ZoneFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: {
      id: string
      label: string | null
      zone_type: string
      color: string | null
      description: string | null
    }
    geometry: { type: 'Polygon'; coordinates: number[][][] }
  }>
}

export async function fetchSnorkelSpots(): Promise<SnorkelSpot[]> {
  const res = await apiFetch(`/api/snorkel-spots`)
  if (!res.ok) throw new Error(`Snorkel spots failed: ${res.status}`)
  return res.json()
}

export async function fetchSnorkelZones(spotId: string): Promise<ZoneFeatureCollection> {
  const res = await apiFetch(`/api/snorkel-spots/${spotId}/zones`)
  if (!res.ok) throw new Error(`Snorkel zones failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
//  Hiking trails
// ---------------------------------------------------------------------------
//  Unlike every other listing type, a trail is a LINE. `/api/trails` therefore
//  returns a GeoJSON FeatureCollection, not an array of rows: the same response
//  feeds the results list, the detail panel, AND the MapLibre line layer with
//  no reshaping.

export type TrailDifficulty = 'easy' | 'moderate' | 'hard'

export type TrailProperties = {
  id: string
  slug: string
  name: string
  local_name: string | null
  difficulty: TrailDifficulty | null
  /** native | boardwalk | gravel | sand | paved */
  surface: string | null
  route_type: 'out_and_back' | 'loop' | 'point_to_point' | null
  elevation_gain_m: number | null
  /** Authored walking time. Null → the client estimates it from the distance. */
  est_minutes: number | null
  region: string | null
  best_time: string | null
  /** none | partial | full */
  shade: string | null
  dogs_allowed: boolean | null
  in_wildlife_refuge: boolean
  gate_hours: string | null
  warning: string | null
  description: string | null
  source: string | null
  source_url: string | null
  /** MEASURED off the geometry by Postgres (generated column) — always current. */
  distance_km: number | null
  distance_mi: number | null
  /**
   * The length the source *prints*. Deliberately separate from `distance_mi`:
   * the USFWS inventory is from ~2012, so a disagreement means the published
   * figure or the geometry is stale, and neither should quietly win.
   */
  published_distance_mi: number | null
  /** ST_StartPoint of the line — where you actually park and start walking. */
  trailhead_lat: number
  trailhead_lng: number
}

export type TrailFeature = {
  type: 'Feature'
  properties: TrailProperties
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

export type TrailFeatureCollection = {
  type: 'FeatureCollection'
  features: TrailFeature[]
}

export async function fetchTrails(): Promise<TrailFeatureCollection> {
  const res = await apiFetch('/api/trails')
  // Hiking rides the 'activities' feature bundle, so an un-upgraded user gets a
  // 402 here. raise() preserves the UPGRADE_REQUIRED code so ResultsList can
  // show the upsell instead of "couldn't load hiking".
  if (!res.ok) await raise(res, 'Trails request failed')
  return res.json()
}

export type ServiceCategory = { slug: string; label: string }

export type ServiceListing = {
  id: string
  name: string
  description: string | null
  phones: string[]
  email: string | null
  website: string | null
  address: string | null
  location_area: string | null
  latitude: number | null
  longitude: number | null
  has_location: boolean
  hours: string | null
}

export async function fetchServiceCategories(): Promise<ServiceCategory[]> {
  const res = await apiFetch(`/api/service-categories`)
  if (!res.ok) throw new Error(`Service categories failed: ${res.status}`)
  return res.json()
}

export async function fetchServiceListings(slug: string): Promise<ServiceListing[]> {
  const res = await apiFetch(`/api/services/${slug}`)
  if (!res.ok) throw new Error(`Service listings failed: ${res.status}`)
  return res.json()
}

// NOTE: startCheckout used to live here. Payment and plan advertising moved
// entirely to the landing app (landing/src/pages/Pricing.jsx), so the map app
// no longer starts Stripe sessions — it links out to `${LANDING_URL}/pricing`.

export type TransportCategory = { slug: string; label: string; is_physical: boolean }
export type TransportVehicle = {
  make: string | null
  model: string | null
  doors: number | null
  passengers: number | null
}

export type TransportListing = {
  id: string
  name: string
  description: string | null
  phones: string[]
  email: string | null
  website: string | null
  address: string | null
  location_area: string | null
  latitude: number | null
  longitude: number | null
  has_location: boolean
  hours: string | null
  metadata: {
    vehicle_type?: string
    passengers?: number
    plate?: string
    [key: string]: unknown
  }
  vehicles: TransportVehicle[]
}

export async function fetchTransportCategories(): Promise<TransportCategory[]> {
  const res = await apiFetch(`/api/transport-categories`)
  if (!res.ok) throw new Error(`Transport categories failed: ${res.status}`)
  return res.json()
}

export async function fetchTransportListings(slug: string): Promise<TransportListing[]> {
  const res = await apiFetch(`/api/transport/${slug}`)
  if (!res.ok) throw new Error(`Transport listings failed: ${res.status}`)
  return res.json()
}

export type RestaurantCategory = { slug: string; label: string }

export type RestaurantListing = {
  id: string
  name: string
  description: string | null
  phones: string[]
  cuisine: string | null
  price: string | null
  hours: string | null
  email: string | null
  website: string | null
  address: string | null
  location_area: string | null
  latitude: number | null
  longitude: number | null
  has_location: boolean
}

export async function fetchRestaurantCategories(): Promise<RestaurantCategory[]> {
  const res = await apiFetch(`/api/restaurant-categories`)
  if (!res.ok) throw new Error(`Restaurant categories failed: ${res.status}`)
  return res.json()
}

export async function fetchRestaurantListings(slug: string): Promise<RestaurantListing[]> {
  const res = await apiFetch(`/api/restaurants/${slug}`)
  if (!res.ok) throw new Error(`Restaurant listings failed: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
//  Stays
// ---------------------------------------------------------------------------

export type StayListing = {
  id: string
  name: string
  local_name: string | null
  description: string | null
  property_type: string | null
  sleeps: number | null
  bedrooms: number | null
  bathrooms: number | null
  unit_count: number | null
  price_band: string | null
  nightly_min: number | null
  nightly_max: number | null
  price_note: string | null
  min_nights: number | null
  currency: string
  check_in: string | null
  check_out: string | null
  pets_allowed: boolean | null
  accessible: boolean | null
  amenities: string[]
  phones: string[]
  email: string | null
  website: string | null
  booking_url: string | null
  hours: string | null
  images: string[]
  image_credit: string | null
  latitude: number | null
  longitude: number | null
  has_location: boolean
  address: string | null
  location_area: string | null
  location_precision: string | null
  directions_note: string | null
}

export type StayCategory = { slug: string; label: string }

/** Chips for the stays panel: Hotels, Guest House, Vacation Rental, Eco Retreat. */
export async function fetchStayCategories(): Promise<StayCategory[]> {
  const res = await apiFetch(`/api/stay-categories`)
  if (!res.ok) await raise(res, 'Stay categories failed')
  return res.json()
}

/**
 * All lodging in one call, or one category of it.
 *
 * Unlike restaurants the slug is optional and the unfiltered list is the
 * default view — there are only ~6 properties island-wide, so making a traveller
 * pick a chip before seeing anything would hide most of the island's lodging
 * behind a guess about what they want.
 *
 * Uses `raise` rather than a bare Error so a free-tier 402 arrives as an
 * ApiError with code 'UPGRADE_REQUIRED' and ResultsList can render the upsell.
 */
export async function fetchStays(category?: string | null): Promise<StayListing[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''
  const res = await apiFetch(`/api/stays${qs}`)
  if (!res.ok) await raise(res, 'Stays failed')
  return res.json()
}

/**
 * Tripadvisor content for one stay, already projected server-side.
 *
 * `rating_image_url` and `web_url` are not optional garnish: the Content API
 * licence requires displaying Tripadvisor's own rating image and linking back
 * to the listing wherever their content appears. Same for `photos[].credit`.
 */
export type TripadvisorInfo = {
  location_id: string
  name: string
  /** Tripadvisor's own coordinates for the listing. Not necessarily the same
   *  point as `stay_listings.latitude` — see db/scripts/sync_tripadvisor_coords.mjs. */
  latitude: number | null
  longitude: number | null
  rating: number | null
  num_reviews: number | null
  ranking_string: string | null
  price_level: string | null
  web_url: string | null
  rating_image_url: string | null
  awards: string[]
  photos: { thumbnail: string | null; large: string | null; caption: string | null; credit: string | null }[]
  /** At most 5 — the free tier's hard cap, with no paging. Each carries a `url`
   *  back to the review, which the licence requires wherever the text appears. */
  reviews: {
    id: string
    title: string | null
    text: string | null
    rating: number | null
    published_date: string | null
    trip_type: string | null
    url: string | null
    author: string | null
  }[]
  fetched_at: string
}

/**
 * Null means "no Tripadvisor block for this property" — either it has no
 * listing (204) or the upstream is unreachable. Both are normal states the
 * panel renders around, so neither throws.
 */
export async function fetchTripadvisor(
  resource: 'stays' | 'restaurants',
  id: string,
): Promise<TripadvisorInfo | null> {
  const res = await apiFetch(`/api/${resource}/${id}/tripadvisor`)
  if (res.status === 204) return null
  if (!res.ok) return null
  return res.json()
}

export type AiPin = {
  id: string
  name: string
  kind: string
  latitude: number
  longitude: number
}

export type AiChatMessage = { role: 'user' | 'assistant'; content: string }

export async function sendAiChat(
  messages: AiChatMessage[],
): Promise<{ reply: string; pins: AiPin[]; creditsRemaining: number }> {
  const res = await apiFetch(`/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  // A 402 here means the allowance is spent. Thrown as an ApiError with
  // code 'NO_CREDITS' so AiChatPane can offer an upgrade rather than printing
  // the raw server message.
  if (!res.ok) await raise(res, 'AI chat failed')
  return res.json()
}

export type DirectionsResult = {
  from: { name: string; kind: string; latitude: number; longitude: number }
  to: { name: string; kind: string; latitude: number; longitude: number }
  distance_m: number
  duration_s: number
  geometry: { type: 'LineString'; coordinates: number[][] }
  google_maps_url: string
}

export async function fetchDirections(from: string, to: string): Promise<DirectionsResult> {
  const res = await apiFetch(`/api/directions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `Directions failed: ${res.status}`)
  }
  return res.json()
}

export type EssentialCategory = { slug: string; label: string }
export type EssentialListing = ServiceListing // same shape

export async function fetchEssentialCategories(): Promise<EssentialCategory[]> {
  const res = await apiFetch(`/api/essential-categories`)
  if (!res.ok) throw new Error(`Essential categories failed: ${res.status}`)
  return res.json()
}

export async function fetchEssentialListings(slug: string): Promise<EssentialListing[]> {
  const res = await apiFetch(`/api/essentials/${slug}`)
  if (!res.ok) throw new Error(`Essential listings failed: ${res.status}`)
  return res.json()
}