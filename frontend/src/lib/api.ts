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
const API_BASE = resolveApiBase()

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
  const res = await fetch(`${API_BASE}/api/beaches${q ? `?${q}` : ''}`)
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
  const res = await fetch(`${API_BASE}/api/activity-categories`)
  if (!res.ok) throw new Error(`Activity categories failed: ${res.status}`)
  return res.json()
}

export async function fetchActivityListings(slug: string): Promise<ActivityListing[]> {
  const res = await fetch(`${API_BASE}/api/activities/${slug}`)
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
  const res = await fetch(`${API_BASE}/api/snorkel-spots`)
  if (!res.ok) throw new Error(`Snorkel spots failed: ${res.status}`)
  return res.json()
}

export async function fetchSnorkelZones(spotId: string): Promise<ZoneFeatureCollection> {
  const res = await fetch(`${API_BASE}/api/snorkel-spots/${spotId}/zones`)
  if (!res.ok) throw new Error(`Snorkel zones failed: ${res.status}`)
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
  const res = await fetch(`${API_BASE}/api/service-categories`)
  if (!res.ok) throw new Error(`Service categories failed: ${res.status}`)
  return res.json()
}

export async function fetchServiceListings(slug: string): Promise<ServiceListing[]> {
  const res = await fetch(`${API_BASE}/api/services/${slug}`)
  if (!res.ok) throw new Error(`Service listings failed: ${res.status}`)
  return res.json()
}

export async function startCheckout(plan: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `Checkout failed: ${res.status}`)
  }
  const { url } = await res.json()
  if (url) window.location.href = url // redirect to Stripe
}

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
  const res = await fetch(`${API_BASE}/api/transport-categories`)
  if (!res.ok) throw new Error(`Transport categories failed: ${res.status}`)
  return res.json()
}

export async function fetchTransportListings(slug: string): Promise<TransportListing[]> {
  const res = await fetch(`${API_BASE}/api/transport/${slug}`)
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
  const res = await fetch(`${API_BASE}/api/restaurant-categories`)
  if (!res.ok) throw new Error(`Restaurant categories failed: ${res.status}`)
  return res.json()
}

export async function fetchRestaurantListings(slug: string): Promise<RestaurantListing[]> {
  const res = await fetch(`${API_BASE}/api/restaurants/${slug}`)
  if (!res.ok) throw new Error(`Restaurant listings failed: ${res.status}`)
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
): Promise<{ reply: string; pins: AiPin[] }> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg.error || `AI chat failed: ${res.status}`)
  }
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
  const res = await fetch(`${API_BASE}/api/directions`, {
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
  const res = await fetch(`${API_BASE}/api/essential-categories`)
  if (!res.ok) throw new Error(`Essential categories failed: ${res.status}`)
  return res.json()
}

export async function fetchEssentialListings(slug: string): Promise<EssentialListing[]> {
  const res = await fetch(`${API_BASE}/api/essentials/${slug}`)
  if (!res.ok) throw new Error(`Essential listings failed: ${res.status}`)
  return res.json()
}