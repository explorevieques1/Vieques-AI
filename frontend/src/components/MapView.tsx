import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

import {
  fetchDirections,
  fetchSnorkelZones,
  type AiPin,
  type BeachFilters,
  type DirectionsResult,
} from '../lib/api'
import {
  isMappable,
  categoryMeta,
  type CategorySlug,
  type Place,
} from '../lib/place'
import { makeMarkerEl } from '../lib/markerIcon'
import { DEFAULT_MAP_STYLE, styleUrl } from '../lib/mapStyles'
import { drawSnorkelZones, removeSnorkelZones } from '../lib/snorkelLayers'
import { drawTrails, removeTrails, TRAIL_CLICK_LAYERS } from '../lib/trailLayers'
import { drawRoute, removeRoute } from '../lib/RouteLayer'
import { useCategoryPlaces } from '../hooks/useCategoryPlaces'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  safeInsets,
  useMapInsets,
  DETAIL_PANEL_W,
  RESULTS_PANEL_W,
  SHEET_PEEK,
} from '../hooks/useMapInsets'
import { useFeature } from '../lib/entitlement'
import BeachFilterPanel from './BeachFilterPanel'
import MapSearchBar from './MapSearchBar'
import MapSheet from './MapSheet'
import MapTopBar from './MapTopBar'
import PlaceDetailPanel from './PlaceDetailPanel'
import TripadvisorBlock, { hasTripadvisor } from './TripadvisorBlock'
import ResultsList, { type SortKey } from './ResultsList'
import UpsellOverlay from './UpsellOverlay'
import { ResponsivePanel } from './ui/ResponsivePanel'

const VIEQUES_CENTER: [number, number] = [-65.44, 18.12]

/**
 * The kind-specific block for the detail panel, if that kind has one.
 *
 * Defined once and passed to both call sites (desktop panel + mobile sheet) —
 * they render the same panel, so anything added to one and not the other is a
 * bug that only shows up at one viewport width.
 */
function detailExtra(place: Place): React.ReactNode {
  return hasTripadvisor(place) ? <TripadvisorBlock place={place} /> : null
}

/**
 * Per-kind arrangement of the detail panel, spread at both call sites for the
 * same reason as `detailExtra`.
 *
 * Stays lead with the name and tags, then the Tripadvisor reviews and photos,
 * and only then the nightly/min-stay/sleeps grid above the contact rows: their
 * own hero photo is one stock shot that the review strip already covers better,
 * so it comes off entirely rather than pushing everything a screen down.
 */
function detailLayout(place: Place) {
  return place.kind === 'stay'
    ? ({ hero: false, extraPosition: 'after-tags', statsPosition: 'bottom' } as const)
    : {}
}

/** Great-circle distance in miles — only used to label result cards. */
function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

type Props = {
  aiPins?: AiPin[]
  route?: DirectionsResult | null
  onRoute?: (r: DirectionsResult | null) => void
  onAskAi: () => void
  aiOpen: boolean
  onDirections: () => void
  dirOpen: boolean
  onProfile: () => void
  profileOpen: boolean
}

/**
 * The map screen: full-bleed MapLibre canvas with floating glass panels over it.
 *
 * Desktop lays results on the left and the selected place on the right, and the
 * map pads its camera by both so the pin lands in the visible gap between them
 * (see hooks/useMapInsets). Mobile stacks the same two views into one draggable
 * sheet whose live height feeds the same padding, so the sheet never covers the
 * pin and dragging it down re-centres.
 */
function MapView({
  aiPins,
  route,
  onRoute,
  onAskAi,
  aiOpen,
  onDirections,
  dirOpen,
  onProfile,
  profileOpen,
}: Props) {
  // Snorkeling is the Vacation-tier upsell (PRICING.md §4). Advisory only —
  // requireTier on the server and the RLS policy in 0022 are the real gates.
  const canSnorkel = useFeature('snorkel_zones')
  const isMobile = useIsMobile()

  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const routeMarkersRef = useRef<maplibregl.Marker[]>([])

  const [styleId, setStyleId] = useState(DEFAULT_MAP_STYLE)
  const [category, setCategory] = useState<CategorySlug | null>(null)
  const [subSlug, setSubSlug] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)
  const [beachFilters, setBeachFilters] = useState<BeachFilters>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('nearest')
  const [tourFilter, setTourFilter] = useState<'all' | 'tours'>('all')
  const [snorkelLegend, setSnorkelLegend] = useState<
    { label: string | null; color: string | null; description: string | null }[]
  >([])
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null)

  // Mobile sheet geometry. `sheetHeight` is the live pixel height reported by
  // ResponsivePanel's ResizeObserver; it drives the map's bottom padding.
  const [snap, setSnap] = useState<string | number | null>(SHEET_PEEK)
  const [sheetHeight, setSheetHeight] = useState(0)

  const { places: rawPlaces, subcategories, loading, locked, error } = useCategoryPlaces(
    category,
    subSlug,
    beachFilters,
    canSnorkel,
  )

  const snorkelling = category === 'activities' && subSlug === 'snorkeling'

  // ---------------------------------------------------------------------------
  //  Derived list: snorkel tour toggle, distance, sort
  // ---------------------------------------------------------------------------

  const distances = useMemo(() => {
    const m = new Map<string, number>()
    if (!userLoc) return m
    rawPlaces.forEach((p) => {
      if (isMappable(p)) m.set(p.id, milesBetween(userLoc, [p.longitude, p.latitude]))
    })
    return m
  }, [rawPlaces, userLoc])

  const places = useMemo(() => {
    let list = rawPlaces
    if (snorkelling && tourFilter === 'tours') {
      list = list.filter((p) => (p.raw as { offers_tours?: boolean }).offers_tours)
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      const da = distances.get(a.id)
      const db = distances.get(b.id)
      // Without geolocation "nearest" has nothing to sort on — fall back to
      // name so the order is at least stable and predictable.
      if (da == null || db == null) return a.name.localeCompare(b.name)
      return da - db
    })
    return sorted
  }, [rawPlaces, snorkelling, tourFilter, sort, distances])

  const resultsOpen = category != null
  const detailOpen = selected != null
  const insets = useMapInsets({
    resultsOpen,
    detailOpen,
    sheetHeight: detailOpen || resultsOpen ? sheetHeight : 0,
  })

  /** Clamp the inset box to the current canvas before handing it to MapLibre. */
  const padding = useCallback(() => {
    const map = mapRef.current
    if (!map) return insets
    const c = map.getCanvas()
    return safeInsets(insets, c.clientWidth, c.clientHeight)
  }, [insets])

  // ---------------------------------------------------------------------------
  //  Map lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl(DEFAULT_MAP_STYLE),
      center: VIEQUES_CENTER,
      zoom: 12,
    })
    map.on('load', () => map.resize())
    const t = setTimeout(() => map.resize(), 200)
    mapRef.current = map
    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
    }
  }, [])

  const changeStyle = (id: string) => {
    if (!mapRef.current || id === styleId) return
    mapRef.current.setStyle(styleUrl(id))
    setStyleId(id)
  }

  // Ask for location once, opportunistically. Denial is fine — distance labels
  // simply don't render rather than showing a made-up number.
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    )
  }, [])

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
  }

  // ---------------------------------------------------------------------------
  //  Selection
  // ---------------------------------------------------------------------------

  const selectPlace = useCallback(
    (p: Place) => {
      setSelected(p)
      setSnap(SHEET_PEEK)
      const map = mapRef.current
      if (!map || !isMappable(p)) return
      if (p.geometry) {
        // Zooming to a fixed 15 on the trailhead would put a 3-mile trail's far
        // end off screen. Frame the whole line instead — and cap the zoom so a
        // 100 m spur doesn't slam the camera into max zoom.
        const b = new maplibregl.LngLatBounds()
        p.geometry.coordinates.forEach((c) => b.extend(c))
        map.fitBounds(b, { padding: padding(), maxZoom: 16, speed: 1.2 })
      } else {
        map.flyTo({
          center: [p.longitude, p.latitude],
          zoom: 15,
          speed: 1.2,
          padding: padding(),
        })
      }
      // Snorkel spots carry zone polygons; drawing them is the point of the
      // Vacation tier, so load them as soon as one is picked.
      if (p.kind === 'snorkel') {
        fetchSnorkelZones((p.raw as { id: string }).id)
          .then((fc) => {
            if (!mapRef.current) return
            drawSnorkelZones(mapRef.current, fc)
            setSnorkelLegend(
              fc.features.map((f) => ({
                label: f.properties.label,
                color: f.properties.color,
                description: f.properties.description,
              })),
            )
          })
          .catch((err) => console.error('Failed to load zones:', err))
      }
    },
    [padding],
  )

  const clearSelection = useCallback(() => {
    setSelected(null)
    setSnap(SHEET_PEEK)
    const map = mapRef.current
    if (map) {
      removeSnorkelZones(map)
      setSnorkelLegend([])
    }
  }, [])

  /**
   * Switching top-level category resets everything scoped to the old one.
   *
   * Done in the event handler rather than an effect on `category`: the reset is
   * a consequence of the click, not a synchronisation with anything external,
   * and an effect would render one frame of the new category holding the old
   * category's selection.
   */
  const selectCategory = useCallback(
    (slug: CategorySlug | null) => {
      setCategory(slug)
      setSubSlug(null)
      setSelected(null)
      setSnap(SHEET_PEEK)
      setTourFilter('all')
      setSnorkelLegend([])
      const map = mapRef.current
      if (map) {
        removeSnorkelZones(map)
        removeTrails(map)
      }
      if (slug !== 'beaches') {
        setBeachFilters({})
        setFilterOpen(false)
      }
    },
    [],
  )

  // ---------------------------------------------------------------------------
  //  Markers — one effect for every category
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // AI pins own the map while they're up; don't fight them.
    if (aiPins && aiPins.length > 0) return

    clearMarkers()
    places.filter(isMappable).forEach((p) => {
      const el = makeMarkerEl(p.icon, p.id === selected?.id)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.longitude, p.latitude])
        .addTo(map)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        selectPlace(p)
      })
      markersRef.current.push(marker)
    })
  }, [places, selected?.id, aiPins, selectPlace])

  // ---------------------------------------------------------------------------
  //  Trails — the one category drawn as lines rather than only pins
  // ---------------------------------------------------------------------------

  const trails = useMemo(() => places.filter((p) => p.geometry), [places])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (trails.length === 0) {
      removeTrails(map)
      return
    }

    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      const hit = trails.find((t) => t.id === id)
      // The line is a much larger click target than the trailhead pin, and on
      // a phone it is usually the only one you can hit — so clicking anywhere
      // along a trail selects it, exactly like clicking its row in the list.
      if (hit) selectPlace(hit)
    }
    const enter = () => (map.getCanvas().style.cursor = 'pointer')
    const leave = () => (map.getCanvas().style.cursor = '')

    // Switching basemap calls setStyle, which drops every source and layer we
    // added. Re-adding before the new style has loaded throws, so wait for it.
    //
    // `cancelled` matters: if this effect is torn down while still waiting on
    // `idle`, the deferred draw would otherwise still run and attach listeners
    // that the cleanup below has already come and gone for — leaking a handler
    // per basemap switch.
    let cancelled = false
    const draw = () => {
      if (cancelled || !mapRef.current) return
      drawTrails(mapRef.current, trails, selected?.id ?? null)
      TRAIL_CLICK_LAYERS.forEach((layer) => {
        map.on('click', layer, onClick)
        map.on('mouseenter', layer, enter)
        map.on('mouseleave', layer, leave)
      })
    }
    if (map.isStyleLoaded()) draw()
    else map.once('idle', draw)

    return () => {
      cancelled = true
      TRAIL_CLICK_LAYERS.forEach((layer) => {
        map.off('click', layer, onClick)
        map.off('mouseenter', layer, enter)
        map.off('mouseleave', layer, leave)
      })
    }
  }, [trails, selected?.id, styleId, selectPlace])

  // Frame the whole result set when the list changes (but not when the user is
  // merely picking rows out of it — flyTo already handled that).
  const framedKey = useRef<string>('')
  useEffect(() => {
    const map = mapRef.current
    if (!map || (aiPins && aiPins.length > 0)) return
    const mappable = places.filter(isMappable)
    const key = `${category}:${subSlug}:${mappable.map((p) => p.id).join(',')}`
    if (key === framedKey.current) return
    framedKey.current = key
    if (mappable.length === 0) return
    const bounds = new maplibregl.LngLatBounds()
    mappable.forEach((p) => {
      // A trail framed by its trailhead alone would leave most of the line off
      // screen — extend over the whole shape where there is one.
      if (p.geometry) p.geometry.coordinates.forEach((c) => bounds.extend(c))
      else bounds.extend([p.longitude, p.latitude])
    })
    map.fitBounds(bounds, { padding: padding(), maxZoom: 14 })
  }, [places, category, subSlug, aiPins, padding])

  // Re-centre when the chrome moves: a panel opens/closes, or the mobile sheet
  // snaps to a new height. This single effect is the whole "swipe down and the
  // pin comes back" behaviour.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const pad = padding()
    if (selected?.geometry) {
      // Re-fit rather than re-centre: the selection is a line, and easing to
      // its trailhead would undo the framing selectPlace just did.
      const b = new maplibregl.LngLatBounds()
      selected.geometry.coordinates.forEach((c) => b.extend(c))
      map.fitBounds(b, { padding: pad, maxZoom: 16, duration: 400 })
    } else if (selected && isMappable(selected)) {
      map.easeTo({ center: [selected.longitude, selected.latitude], padding: pad, duration: 400 })
    } else {
      map.easeTo({ padding: pad, duration: 400 })
    }
    // `selected` is intentionally not a dep: selecting already flies the camera
    // in selectPlace, and re-running here would double-animate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padding])

  // Pins returned by the AI assistant. Different colors per kind.
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
    map.fitBounds(bounds, { padding: padding(), maxZoom: 15 })
    // padding is deliberately omitted: re-framing AI pins every time a panel
    // moves would yank the camera away from what the user is reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPins])

  // Draw the directions route when one is provided; clear it when null.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (route) drawRoute(map, route, routeMarkersRef.current)
    else removeRoute(map, routeMarkersRef.current)
  }, [route])

  /**
   * In-app routing for places we can name to the backend geocoder. The origin
   * defaults to the ferry terminal — the island's arrival point. Falls back to
   * Google Maps if name resolution fails.
   */
  const handleDirections = (p: Place) => {
    if (!onRoute || !isMappable(p)) return
    fetchDirections('Vieques Ferry Terminal', p.name)
      .then((res) => {
        onRoute(res)
        clearSelection()
      })
      .catch((err) => {
        console.error('Directions failed:', err)
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`,
          '_blank',
        )
      })
  }

  // ---------------------------------------------------------------------------
  //  Render
  // ---------------------------------------------------------------------------

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = []
    beachFilters.type?.forEach((t) =>
      chips.push({
        key: `type:${t}`,
        label: t,
        onRemove: () =>
          setBeachFilters((f) => ({ ...f, type: f.type?.filter((x) => x !== t) })),
      }),
    )
    if (beachFilters.water)
      chips.push({
        key: 'water',
        label: beachFilters.water,
        onRemove: () => setBeachFilters((f) => ({ ...f, water: undefined })),
      })
    beachFilters.facilities?.forEach((t) =>
      chips.push({
        key: `fac:${t}`,
        label: t,
        onRemove: () =>
          setBeachFilters((f) => ({ ...f, facilities: f.facilities?.filter((x) => x !== t) })),
      }),
    )
    if (typeof beachFilters.refuge === 'boolean')
      chips.push({
        key: 'refuge',
        label: beachFilters.refuge ? 'In refuge' : 'Outside refuge',
        onRemove: () => setBeachFilters((f) => ({ ...f, refuge: undefined })),
      })
    return chips
  }, [beachFilters])

  const searchBar = (
    <MapSearchBar
      places={places}
      onSelect={selectPlace}
      placeholder={
        category ? `Search ${categoryMeta(category).label.toLowerCase()}…` : 'Search the island…'
      }
      styleId={styleId}
      onStyleChange={changeStyle}
      onOpenFilters={category === 'beaches' ? () => setFilterOpen((v) => !v) : undefined}
      filtersOpen={filterOpen}
      activeFilters={activeFilters}
      compact={isMobile}
    />
  )

  const banner = (
    <>
      {/* Snorkelling is Vacation-tier. Show the lock rather than hiding the
          category: a feature the user never sees is a feature they never buy.
          See PRICING.md §4.1. */}
      {snorkelling && locked && (
        <UpsellOverlay
          feature="snorkel_zones"
          title="Snorkeling zone maps"
          blurb="See every snorkeling zone, where to enter the water, depth and difficulty — plus the Bio Bay moon-phase guide."
        />
      )}
      {snorkelling && !locked && (
        <div className="flex gap-1 rounded-2xl border border-white/6 bg-white/3 p-1">
          {(['all', 'tours'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTourFilter(f)}
              className={`flex-1 rounded-xl py-1.5 text-xs transition-colors ${
                tourFilter === f
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'Go Yourself' : 'Book a Tour'}
            </button>
          ))}
        </div>
      )}
      {snorkelLegend.length > 0 && (
        <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Snorkel zones
          </div>
          <ul className="space-y-1.5">
            {snorkelLegend.map((z, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span
                  className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-white/40"
                  style={{ background: z.color ?? '#3b82f6' }}
                />
                <span>
                  <span className="font-medium text-foreground">{z.label}</span>
                  {z.description && <span className="block">{z.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
  const hasBanner = snorkelling || snorkelLegend.length > 0

  const results = category && (
    <ResultsList
      category={category}
      places={places}
      loading={loading}
      selectedId={selected?.id ?? null}
      onSelect={selectPlace}
      subcategories={subcategories}
      activeSub={subSlug}
      onSelectSub={(s) => {
        setSubSlug(s)
        clearSelection()
      }}
      sort={sort}
      onSortChange={setSort}
      distances={distances}
      onClose={isMobile ? undefined : () => selectCategory(null)}
      banner={hasBanner ? banner : undefined}
      error={error}
    />
  )

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      <MapTopBar
        active={category}
        onSelect={selectCategory}
        onAskAi={onAskAi}
        aiOpen={aiOpen}
        onDirections={onDirections}
        dirOpen={dirOpen}
        onProfile={onProfile}
        profileOpen={profileOpen}
      />

      {isMobile ? (
        <>
          {/* Search floats above the sheet on phones — it belongs to the map,
              not to the results, and must stay reachable at any snap height. */}
          {category && (
            // Sits just under MapTopBar's pill row. Offset from the safe-area
            // inset rather than a flat rem so it clears the notch in
            // standalone PWA mode, where the bar starts lower.
            <div className="absolute inset-x-3 z-20 top-[calc(env(safe-area-inset-top)+6.25rem)]">
              <div className="glass rounded-2xl p-2.5">{searchBar}</div>
            </div>
          )}
          {category && (
            <MapSheet
              title={selected?.name ?? categoryMeta(category).label}
              snap={snap}
              onSnapChange={setSnap}
              onHeightChange={setSheetHeight}
              onClose={() => (selected ? clearSelection() : selectCategory(null))}
            >
              {selected ? (
                <PlaceDetailPanel
                  place={selected}
                  onClose={() => selectCategory(null)}
                  onBack={clearSelection}
                  onGetDirections={onRoute ? handleDirections : undefined}
                  extra={detailExtra(selected)}
                  {...detailLayout(selected)}
                />
              ) : (
                results
              )}
            </MapSheet>
          )}
        </>
      ) : (
        <>
          {category && (
            <ResponsivePanel
              variant="floating"
              side="left"
              title={categoryMeta(category).label}
              desktopWidth="sm:w-[344px]"
              onClose={() => selectCategory(null)}
            >
              <div className="shrink-0 border-b border-white/8 p-4">{searchBar}</div>
              {results}
            </ResponsivePanel>
          )}

          {selected && (
            <ResponsivePanel
              variant="floating"
              side="right"
              title={selected.name}
              desktopWidth="sm:w-[400px]"
              onClose={clearSelection}
            >
              <PlaceDetailPanel
                place={selected}
                onClose={clearSelection}
                onGetDirections={onRoute ? handleDirections : undefined}
                extra={detailExtra(selected)}
                {...detailLayout(selected)}
              />
            </ResponsivePanel>
          )}
        </>
      )}

      {/* Zoom / recentre, tucked clear of the detail panel. */}
      <div
        className="absolute z-10 flex flex-col gap-2"
        style={{
          bottom: isMobile ? `calc(${sheetHeight}px + 1rem)` : '1.25rem',
          right: !isMobile && detailOpen ? `${DETAIL_PANEL_W + 40}px` : '1.25rem',
        }}
      >
        <div className="glass flex flex-col rounded-2xl p-1">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="grid h-10 w-10 place-items-center rounded-xl text-foreground hover:bg-white/8"
          >
            +
          </button>
          <div className="mx-2 h-px bg-white/8" />
          <button
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="grid h-10 w-10 place-items-center rounded-xl text-foreground hover:bg-white/8"
          >
            −
          </button>
        </div>
        <button
          onClick={() =>
            mapRef.current?.easeTo({
              center: userLoc ?? VIEQUES_CENTER,
              zoom: userLoc ? 14 : 12,
              padding: padding(),
            })
          }
          aria-label="Recentre map"
          className="glass grid h-12 w-12 place-items-center rounded-2xl text-foreground hover:bg-white/8"
        >
          ◎
        </button>
      </div>

      {/* Scale / attribution strip. */}
      <div
        className="glass pointer-events-none absolute bottom-5 z-10 hidden items-center gap-2.5 rounded-xl px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground sm:flex"
        style={{ left: resultsOpen ? `${RESULTS_PANEL_W + 40}px` : '1.25rem' }}
      >
        © Explore Vieques · MapTiler · OpenStreetMap
      </div>

      {category === 'beaches' && filterOpen && (
        <BeachFilterPanel
          filters={beachFilters}
          onChange={setBeachFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  )
}

export default MapView
