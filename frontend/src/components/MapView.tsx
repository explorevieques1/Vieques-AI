import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import {
  fetchBeaches,
  fetchActivityListings,
  fetchActivityCategories,
  fetchServiceCategories,
  fetchServiceListings,
  fetchTransportListings,
  fetchRestaurantListings,
  fetchDirections,
  fetchEssentialListings,
  fetchSnorkelSpots,
  fetchSnorkelZones,
  type Beach,
  type ActivityListing,
  type BeachFilters,
  type ServiceListing,
  type TransportListing,
  type RestaurantListing,
  type EssentialListing,
  type SnorkelSpot,
  type AiPin,
  type DirectionsResult,
} from '../lib/api'
import type { CategorySlug } from './CategoryTabs'
import DetailPanel from './DetailPanel'
import SearchBar from './SearchBar'
import CategoryListSidebar from './CategoryListSidebar'
import TransportationSidebar from './TransportationSidebar'
import RestaurantSidebar from './RestaurantSidebar'
import EssentialsSidebar from './EssentialsSidebar'
import TaxiListPanel from './TaxiListPanel'
import CarRentalPanel from './CarRentalPanel'
import BeachFilterPanel from './BeachFilterPanel'
import { makeMarkerEl, BEACH_ICON, ACTIVITY_ICONS, ESSENTIAL_ICONS, DEFAULT_ICON } from '../lib/markerIcon'
import { drawSnorkelZones, removeSnorkelZones } from '../lib/snorkelLayers'
import { drawRoute, removeRoute } from '../lib/RouteLayer'
import RestaurantDetailPanel from './RestaurantDetailPanel'

const VIEQUES_CENTER: [number, number] = [-65.44, 18.12]
const KEY = import.meta.env.VITE_MAPTILER_KEY

const STYLES = [
  { label: 'Satellite', id: 'hybrid' },
  { label: 'Streets', id: 'streets-v2' },
  { label: 'Outdoor', id: 'outdoor-v2' },
  { label: 'Basic', id: 'basic-v2' },
] as const

const styleUrl = (id: string) =>
  `https://api.maptiler.com/maps/${id}/style.json?key=${KEY}`

type Props = {
  activeCategory: CategorySlug | null
  aiPins?: AiPin[]
  route?: DirectionsResult | null
  onRoute?: (r: DirectionsResult | null) => void
  onCloseCategory?: () => void
}

function MapView({ activeCategory, aiPins, route, onRoute, onCloseCategory }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const routeMarkersRef = useRef<maplibregl.Marker[]>([])
  const [active, setActive] = useState<string>('streets-v2')
  const [beaches, setBeaches] = useState<Beach[]>([])
  const [selected, setSelected] = useState<Beach | null>(null)
  const [beachFilters, setBeachFilters] = useState<BeachFilters>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [activitySlug, setActivitySlug] = useState<string | null>(null)
  const [serviceSlug, setServiceSlug] = useState<string | null>(null)
  const [transportSlug, setTransportSlug] = useState<string | null>(null)
  const [restaurantSlug, setRestaurantSlug] = useState<string | null>(null)
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantListing | null>(null)
  const [essentialSlug, setEssentialSlug] = useState<string | null>(null)
  const [taxiDrivers, setTaxiDrivers] = useState<TransportListing[] | null>(null)
  const [taxiLoading, setTaxiLoading] = useState(false)
  const [selectedCarRental, setSelectedCarRental] = useState<TransportListing | null>(null)
  const [snorkelLegend, setSnorkelLegend] = useState<
    { label: string | null; color: string | null; description: string | null }[]
  >([])
  const [snorkelSpots, setSnorkelSpots] = useState<SnorkelSpot[]>([])
  const [tourFilter, setTourFilter] = useState<'all' | 'tours'>('all')
  const zonesShown = snorkelLegend.length > 0

  const sidebarOpen =
    activeCategory === 'activities' ||
    activeCategory === 'services' ||
    activeCategory === 'transportation' ||
    activeCategory === 'restaurants' ||
    activeCategory === 'essentials'

  // init map once — proven working init, unchanged
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl('streets-v2'),
      center: VIEQUES_CENTER,
      zoom: 12,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => map.resize())
    const t = setTimeout(() => map.resize(), 200)
    mapRef.current = map
    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
    }
  }, [])

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
  }

  // Render pins returned by the AI assistant. Different colors per kind.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !aiPins || aiPins.length === 0) return
    clearMarkers()
    const colors: Record<string, string> = {
      beach: '#06b6d4',
      restaurant: '#f97316',
      transport: '#0ea5e9',
      activity: '#22c55e',
    }
    const bounds = new maplibregl.LngLatBounds()
    aiPins.forEach((p) => {
      const marker = new maplibregl.Marker({ color: colors[p.kind] || '#a855f7', anchor: 'center' })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setHTML(
            `<div style="font-family:system-ui;color:#e2e8f0"><div style="font-weight:600;font-size:14px">${p.name}</div></div>`,
          ),
        )
        .addTo(map)
      markersRef.current.push(marker)
      bounds.extend([p.longitude, p.latitude])
    })
    if (aiPins.length) map.fitBounds(bounds, { padding: 120, maxZoom: 15 })
  }, [aiPins])

  const selectBeach = (b: Beach) => {
    setSelected(b)
    mapRef.current?.flyTo({ center: [b.longitude, b.latitude], zoom: 15, speed: 1.2 })
  }

  // reset everything when the top-level category changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    clearMarkers()
    removeSnorkelZones(map)
    setSnorkelLegend([])
    setSnorkelSpots([])
    setTourFilter('all')
    setSelected(null)
    setBeaches([])
    setActivitySlug(null)
    setServiceSlug(null)
    setTransportSlug(null)
    setRestaurantSlug(null)
    setSelectedRestaurant(null)
    setEssentialSlug(null)
    setTaxiDrivers(null)
    setSelectedCarRental(null)
    if (activeCategory !== 'beaches') {
      setBeachFilters({})
      setFilterOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory])

  // Load + plot beaches; re-runs when filters change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || activeCategory !== 'beaches') return
    let cancelled = false
    clearMarkers()
    setSelected(null)
    fetchBeaches(beachFilters)
      .then((data) => {
        if (cancelled || !mapRef.current) return
        setBeaches(data)
        const bounds = new maplibregl.LngLatBounds()
        data.forEach((b) => {
          const el = makeMarkerEl(BEACH_ICON)
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([b.longitude, b.latitude])
            .addTo(map)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            selectBeach(b)
          })
          markersRef.current.push(marker)
          bounds.extend([b.longitude, b.latitude])
        })
        if (data.length) map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load beaches:', err))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, beachFilters])

  // when an activity is picked in the sidebar, drop its pins
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activitySlug) return
    clearMarkers()
    removeSnorkelZones(map)
    setSnorkelLegend([])

    // --- Snorkeling: load spots into state; a separate effect plots them ---
    if (activitySlug === 'snorkeling') {
      let cancelled = false
      fetchSnorkelSpots()
        .then((spots: SnorkelSpot[]) => {
          if (cancelled) return
          setSnorkelSpots(spots)
        })
        .catch((err) => console.error('Failed to load snorkel spots:', err))
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    fetchActivityListings(activitySlug)
      .then((items: ActivityListing[]) => {
        if (cancelled || !mapRef.current) return
        const withCoords = items.filter((i) => i.latitude != null && i.longitude != null)
        const bounds = new maplibregl.LngLatBounds()
        withCoords.forEach((i) => {
          const style = ACTIVITY_ICONS[activitySlug] ?? ACTIVITY_ICONS['adventures']
          const marker = new maplibregl.Marker({ element: makeMarkerEl(style), anchor: 'center' })
            .setLngLat([i.longitude as number, i.latitude as number])
            .setPopup(
              new maplibregl.Popup({ offset: 24 }).setHTML(
                `<div style="font-family:system-ui;color:#e2e8f0;max-width:220px">
                   <div style="font-weight:600;font-size:14px">${i.name}</div>
                   ${i.phones?.length ? `<div style="font-size:12px;color:#94a3b8">${i.phones.join(', ')}</div>` : ''}
                   ${i.description ? `<div style="margin-top:6px;font-size:12px">${i.description}</div>` : ''}
                 </div>`,
              ),
            )
            .addTo(map)
          markersRef.current.push(marker)
          bounds.extend([i.longitude as number, i.latitude as number])
        })
        if (withCoords.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load activity listings:', err))

    return () => {
      cancelled = true
    }
  }, [activitySlug])

  // Plot snorkel markers from state, re-filtering when the toggle changes.
  // Hidden once a spot's zones are shown (zonesShown).
  useEffect(() => {
    const map = mapRef.current
    if (!map || activitySlug !== 'snorkeling') return
    if (zonesShown) return // keep current view while zones are displayed

    clearMarkers()
    const visible =
      tourFilter === 'tours' ? snorkelSpots.filter((s) => s.offers_tours) : snorkelSpots

    const bounds = new maplibregl.LngLatBounds()
    visible.forEach((sp) => {
      const el = makeMarkerEl(ACTIVITY_ICONS['snorkeling'])
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([sp.longitude, sp.latitude])
        .addTo(map)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        map.flyTo({ center: [sp.longitude, sp.latitude], zoom: 15, speed: 1.2 })
        fetchSnorkelZones(sp.id)
          .then((fc) => {
            if (!mapRef.current) return
            drawSnorkelZones(map, fc)
            setSnorkelLegend(
              fc.features.map((f) => ({
                label: f.properties.label,
                color: f.properties.color,
                description: f.properties.description,
              })),
            )
          })
          .catch((err) => console.error('Failed to load zones:', err))
      })
      markersRef.current.push(marker)
      bounds.extend([sp.longitude, sp.latitude])
    })
    if (visible.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snorkelSpots, tourFilter, activitySlug, zonesShown])

  // Plot service listings (only mappable ones) when a service is selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !serviceSlug) return
    clearMarkers()
    let cancelled = false
    fetchServiceListings(serviceSlug)
      .then((items: ServiceListing[]) => {
        if (cancelled || !mapRef.current) return
        const located = items.filter(
          (i) => i.has_location && i.latitude != null && i.longitude != null,
        )
        const bounds = new maplibregl.LngLatBounds()
        located.forEach((i) => {
          const marker = new maplibregl.Marker({ color: '#8b5cf6', anchor: 'center' })
            .setLngLat([i.longitude as number, i.latitude as number])
            .setPopup(
              new maplibregl.Popup({ offset: 24 }).setHTML(
                `<div style="font-family:system-ui;color:#e2e8f0;max-width:220px">
                   <div style="font-weight:600;font-size:14px">${i.name}</div>
                   ${i.phones?.length ? `<div style="font-size:12px;color:#94a3b8">${i.phones.join(', ')}</div>` : ''}
                   ${i.address ? `<div style="margin-top:6px;font-size:12px">${i.address}</div>` : ''}
                 </div>`,
              ),
            )
            .addTo(map)
          markersRef.current.push(marker)
          bounds.extend([i.longitude as number, i.latitude as number])
        })
        if (located.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load service listings:', err))
    return () => {
      cancelled = true
    }
  }, [serviceSlug])

  // Load transportation for the selected type.
  // Non-physical (taxis) -> list pane. Physical -> map pins whose click opens
  // the car-rental detail panel.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !transportSlug) return
    clearMarkers()
    setTaxiDrivers(null)
    setSelectedCarRental(null)

    let cancelled = false

    if (transportSlug === 'taxis') {
      setTaxiLoading(true)
      fetchTransportListings('taxis')
        .then((items) => {
          if (cancelled) return
          setTaxiDrivers(items)
          setTaxiLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load taxis:', err)
          setTaxiLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    // physical categories -> pins
    fetchTransportListings(transportSlug)
      .then((items: TransportListing[]) => {
        if (cancelled || !mapRef.current) return
        const located = items.filter(
          (i) => i.has_location && i.latitude != null && i.longitude != null,
        )
        const bounds = new maplibregl.LngLatBounds()
        located.forEach((i) => {
          const marker = new maplibregl.Marker({ color: '#0ea5e9', anchor: 'center' })
            .setLngLat([i.longitude as number, i.latitude as number])
            .addTo(map)
          const el = marker.getElement()
          el.style.cursor = 'pointer'
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            map.flyTo({ center: [i.longitude as number, i.latitude as number], zoom: 15, speed: 1.2 })
            setSelectedCarRental(i)
          })
          markersRef.current.push(marker)
          bounds.extend([i.longitude as number, i.latitude as number])
        })
        if (located.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load transport listings:', err))
    return () => {
      cancelled = true
    }
  }, [transportSlug])

  // Plot restaurant listings (mappable ones) when a category is selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !restaurantSlug) return
    clearMarkers()
    setSelectedRestaurant(null)
    let cancelled = false
    fetchRestaurantListings(restaurantSlug)
      .then((items: RestaurantListing[]) => {
        if (cancelled || !mapRef.current) return
        const located = items.filter(
          (i) => i.has_location && i.latitude != null && i.longitude != null,
        )
        const bounds = new maplibregl.LngLatBounds()
        located.forEach((i) => {
          const marker = new maplibregl.Marker({ color: '#f97316', anchor: 'center' })
            .setLngLat([i.longitude as number, i.latitude as number])
            .addTo(map)
          const el = marker.getElement()
          el.style.cursor = 'pointer'
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            map.flyTo({ center: [i.longitude as number, i.latitude as number], zoom: 15, speed: 1.2 })
            setSelectedRestaurant(i)
          })
          markersRef.current.push(marker)
          bounds.extend([i.longitude as number, i.latitude as number])
        })
        if (located.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load restaurants:', err))
    return () => {
      cancelled = true
    }
  }, [restaurantSlug])

  // Restaurant "Get Directions": route to it. We use the restaurant name as the
  // destination; the from-point defaults to a central island landmark for now.
  const handleRestaurantDirections = (r: RestaurantListing) => {
    // Use the ferry terminal area as a sensible default origin on the island.
    fetchDirections('Vieques Ferry Terminal', r.name)
      .then((res) => {
        onRoute?.(res)
        setSelectedRestaurant(null)
      })
      .catch((err) => {
        // Fallback: if name resolution fails, just open Google Maps for the spot.
        console.error('Directions failed:', err)
        if (r.latitude != null && r.longitude != null) {
          window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}`,
            '_blank',
          )
        }
      })
  }

  // Draw the directions route when one is provided; clear it when null.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (route) {
      drawRoute(map, route, routeMarkersRef.current)
    } else {
      removeRoute(map, routeMarkersRef.current)
    }
  }, [route])

  // Plot essential-service pins (emoji markers) when a category is selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !essentialSlug) return
    clearMarkers()
    let cancelled = false
    fetchEssentialListings(essentialSlug)
      .then((items: EssentialListing[]) => {
        if (cancelled || !mapRef.current) return
        const style = ESSENTIAL_ICONS[essentialSlug] || DEFAULT_ICON
        const located = items.filter(
          (i) => i.has_location && i.latitude != null && i.longitude != null,
        )
        const bounds = new maplibregl.LngLatBounds()
        located.forEach((i) => {
          const el = makeMarkerEl(style)
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([i.longitude as number, i.latitude as number])
            .setPopup(
              new maplibregl.Popup({ offset: 24 }).setHTML(
                `<div style="font-family:system-ui;color:#e2e8f0;max-width:220px">
                   <div style="font-weight:600;font-size:14px">${i.name}</div>
                   ${i.address ? `<div style="margin-top:4px;font-size:12px;color:#94a3b8">${i.address}</div>` : ''}
                   ${i.hours ? `<div style="margin-top:4px;font-size:12px">${i.hours}</div>` : ''}
                   ${i.phones?.length ? `<div style="margin-top:4px;font-size:12px;color:#94a3b8">${i.phones.join(', ')}</div>` : ''}
                 </div>`,
              ),
            )
            .addTo(map)
          markersRef.current.push(marker)
          bounds.extend([i.longitude as number, i.latitude as number])
        })
        if (located.length) map.fitBounds(bounds, { padding: 100, maxZoom: 14 })
      })
      .catch((err) => console.error('Failed to load essentials:', err))
    return () => {
      cancelled = true
    }
  }, [essentialSlug])

  const changeStyle = (id: string) => {
    if (!mapRef.current || id === active) return
    mapRef.current.setStyle(styleUrl(id))
    setActive(id)
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* When a right-side detail panel is open, shift the map's top-right
          controls (zoom/nav) left by the panel width so they stay visible. */}
      {selectedRestaurant && (
        <style>{`
          .maplibregl-ctrl-top-right { transform: translateX(-24rem); transition: transform 0.2s; }
          @media (max-width: 640px) { .maplibregl-ctrl-top-right { transform: none; } }
        `}</style>
      )}

      {/* Beach search — only on beaches, top-left, shifts right if a sidebar is open */}
      {beaches.length > 0 && (
        <div
          className={`absolute top-4 z-10 pointer-events-auto transition-all ${sidebarOpen ? 'max-sm:hidden' : ''}`}
          style={{ left: sidebarOpen ? '16.5rem' : '1rem' }}
        >
          <SearchBar items={beaches} onSelect={selectBeach} placeholder="Search beaches…" />
        </div>
      )}

      {/* Beach filters button — shows whenever Beaches is active */}
      {activeCategory === 'beaches' && (
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className={`absolute z-20 px-4 py-2 text-sm rounded-full shadow-lg transition-colors ${sidebarOpen ? 'max-sm:hidden' : ''} ${
            filterOpen || Object.keys(beachFilters).length > 0
              ? 'bg-cyan-500 text-slate-900 font-medium'
              : 'bg-slate-900/85 backdrop-blur border border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
          style={{ top: '4rem', left: sidebarOpen ? '16.5rem' : '1rem' }}
        >
          Filters{Object.keys(beachFilters).length > 0 ? ' ●' : ''}
        </button>
      )}

      {activeCategory === 'beaches' && filterOpen && (
        <BeachFilterPanel
          filters={beachFilters}
          onChange={setBeachFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {/* Style switcher — top-left area, clear of the top-right zoom controls,
          shifts right when the activities sidebar is open */}
      <div
        className={`absolute top-4 z-10 flex gap-1 rounded-lg bg-slate-900/80 p-1 backdrop-blur border border-slate-700 shadow-lg transition-all ${sidebarOpen ? 'max-sm:hidden' : ''}`}
        style={{
          left: sidebarOpen ? '16.5rem' : beaches.length > 0 ? '21rem' : '1rem',
        }}
      >
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => changeStyle(s.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              active === s.id
                ? 'bg-cyan-500 text-slate-900 font-medium'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* activities sidebar */}
      {activeCategory === 'activities' && (
        <CategoryListSidebar
          title="Activities"
          subtitle="Pick one to see it on the map"
          searchPlaceholder="Search activities…"
          fetchItems={fetchActivityCategories}
          activeSlug={activitySlug}
          onSelect={setActivitySlug}
          onClose={() => onCloseCategory?.()}
        />
      )}

      {/* restaurants sidebar */}
      {activeCategory === 'restaurants' && (
        <RestaurantSidebar
          activeSlug={restaurantSlug}
          onSelect={setRestaurantSlug}
          onClose={() => onCloseCategory?.()}
        />
      )}

      {/* essentials sidebar */}
      {activeCategory === 'essentials' && (
        <EssentialsSidebar
          activeSlug={essentialSlug}
          onSelect={setEssentialSlug}
          onClose={() => onCloseCategory?.()}
        />
      )}

      {/* services sidebar */}
      {activeCategory === 'services' && (
        <CategoryListSidebar
          title="Services"
          subtitle="Pick a service to see providers"
          searchPlaceholder="Search services…"
          fetchItems={fetchServiceCategories}
          activeSlug={serviceSlug}
          onSelect={setServiceSlug}
          onClose={() => onCloseCategory?.()}
        />
      )}

      {/* transportation sidebar */}
      {activeCategory === 'transportation' && (
        <TransportationSidebar
          activeSlug={transportSlug}
          onSelect={(slug) => setTransportSlug(slug)}
          onClose={() => onCloseCategory?.()}
        />
      )}

      {/* taxi driver list pane (non-physical) */}
      {activeCategory === 'transportation' && transportSlug === 'taxis' && taxiDrivers && (
        <TaxiListPanel
          drivers={taxiDrivers}
          loading={taxiLoading}
          onClose={() => setTransportSlug(null)}
        />
      )}

      {/* car rental detail panel (physical, on pin click) */}
      <CarRentalPanel
        company={selectedCarRental}
        onClose={() => setSelectedCarRental(null)}
      />

      {/* snorkel Go Yourself / Book a Tour toggle — only before zones are shown */}
      {activitySlug === 'snorkeling' && !zonesShown && (
        <div
          className={`absolute z-20 flex gap-1 rounded-lg bg-slate-900/85 backdrop-blur border border-slate-700 shadow-lg p-1 ${sidebarOpen ? 'max-sm:hidden' : ''}`}
          style={{ top: '4rem', left: sidebarOpen ? '16.5rem' : '1rem' }}
        >
          <button
            onClick={() => setTourFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tourFilter === 'all'
                ? 'bg-cyan-500 text-slate-900 font-medium'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Go Yourself
          </button>
          <button
            onClick={() => setTourFilter('tours')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tourFilter === 'tours'
                ? 'bg-cyan-500 text-slate-900 font-medium'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Book a Tour
          </button>
        </div>
      )}

      {/* snorkel legend — sits under the style toggles, right of the sidebar */}
      {snorkelLegend.length > 0 && (
        <div
          className={`absolute z-20 w-64 rounded-lg bg-slate-900/90 backdrop-blur border border-slate-700 shadow-xl p-3 ${sidebarOpen ? 'max-sm:hidden' : ''}`}
          style={{ top: '4rem', left: sidebarOpen ? '16.5rem' : '1rem' }}
        >
          <div className="text-xs font-semibold text-white mb-2">Snorkel zones</div>
          <ul className="space-y-1.5">
            {snorkelLegend.map((z, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <span
                  className="mt-0.5 inline-block w-3 h-3 rounded-sm border border-white/40 shrink-0"
                  style={{ background: z.color ?? '#3b82f6' }}
                />
                <span>
                  <span className="text-slate-100 font-medium">{z.label}</span>
                  {z.description ? <span className="block text-slate-400">{z.description}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* beach detail panel */}
      <DetailPanel beach={selected} onClose={() => setSelected(null)} />

      {/* restaurant detail panel (Google Maps style) */}
      <RestaurantDetailPanel
        restaurant={selectedRestaurant}
        onClose={() => setSelectedRestaurant(null)}
        onGetDirections={handleRestaurantDirections}
      />
    </div>
  )
}

export default MapView