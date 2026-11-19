import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Globe, LocateFixed, Minus, PanelLeftOpen, Plus } from 'lucide-react'

import {
  fetchDirections,
  fetchKayakZones,
  fetchSnorkelZones,
  type AiPin,
  type Card,
  type CardPosition,
  type DirectionsResult,
  type Suggestion,
} from '../lib/api'
import {
  isMappable,
  categoryMeta,
  suggestionToPlace,
  tripItemToPlace,
  type CategorySlug,
  type Place,
} from '../lib/place'
import { milesBetween } from '../lib/geo'
import {
  cardPinLabel,
  disposeCardMarkerEl,
  makeCardMarkerEl,
  makeMarkerEl,
  makeUserDotEl,
  setCardPinArt,
  type CardPinState,
} from '../lib/markerIcon'
import { DEFAULT_MAP_STYLE, styleUrl } from '../lib/mapStyles'
import { drawZones, removeAllZones } from '../lib/zoneLayers'
import { drawTrails, removeTrails, TRAIL_CLICK_LAYERS } from '../lib/trailLayers'
import { CARD_RING_RANGE_M, drawCardRing, hasCardRing, removeCardRing } from '../lib/cardLayers'
import { drawRoute, removeRoute } from '../lib/RouteLayer'
import { CameraDirector, pointShot } from '../lib/camera'
import type { ShellMode } from '../lib/shell'
import { useAiChat } from '../lib/aiChat'
import { useCategoryPlaces } from '../hooks/useCategoryPlaces'
import type { Favorites } from '../hooks/useFavorites'
import type { Itineraries } from '../hooks/useItineraries'
import { useIslandSearch, type SearchHit } from '../hooks/useIslandSearch'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCardPins } from '../hooks/useCardPins'
import { useCardRadar } from '../hooks/useCardRadar'
import { useSafeArea } from '../hooks/useSafeArea'
import { daypart, useSuggestion } from '../hooks/useSuggestion'
import {
  mobileTopInset,
  safeInsets,
  useMapInsets,
  CHROME_TOP_PAD,
  DETAIL_PANEL_W,
  RESULTS_PANEL_W,
  SHEET_FULL,
  SHEET_HIDDEN,
  SHEET_PREVIEW,
  type MapInsets,
} from '../hooks/useMapInsets'
import { useEntitlement, useFeature } from '../lib/entitlement'
import AddToTripSheet from './AddToTripSheet'
import AiChatBody from './AiChatBody'
import BottomNav from './BottomNav'
import TopBento from './TopBento'
import { GlassButton, GlassStack } from './GlassControl'
import MapSearchBar from './MapSearchBar'
import MapSheet from './MapSheet'
import MapModesBody from './MapModesBody'
import MapTopBar from './MapTopBar'
import PlaceDetailPanel from './PlaceDetailPanel'
import ProfileBody from './ProfileBody'
import MenuBody from './MenuBody'
import SavedBody from './SavedBody'
import TripadvisorBlock, { hasTripadvisor } from './TripadvisorBlock'
import ResultsList, { type SortKey } from './ResultsList'
import UpsellOverlay from './UpsellOverlay'
import RadarButton from './cards/RadarButton'

/** The radar pill carries the WebGL Radar — kept out of the map's first load (C-3). */
const RadarPill = lazy(() => import('./cards/RadarPill'))
import { ResponsivePanel } from './ui/ResponsivePanel'

const VIEQUES_CENTER: [number, number] = [-65.44, 18.12]

const METRES_PER_MILE = 1609.344

/** Which face a card pin shows (S-3). Owned wins; a revealed card this pass
 *  can't collect shows the lock. */
function cardPinState(c: Card): CardPinState {
  if (c.owned) return 'owned'
  return c.lockedByTier ? 'locked' : 'revealed'
}

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
 * and only then the nightly/min-stay/sleeps grid above the contact rows.
 * The hero shows only when the stay has a real photo (uploaded from the local
 * admin tool): photo-less stays skip the striped placeholder rather than push
 * everything a screen down for nothing.
 */
function detailLayout(place: Place) {
  return place.kind === 'stay'
    ? ({ hero: !!place.photo, extraPosition: 'after-tags', statsPosition: 'bottom' } as const)
    : {}
}

type Props = {
  /** Which of the four things the app is doing — see lib/shell.ts. */
  mode: ShellMode
  onModeChange: (m: ShellMode) => void
  favorites: Favorites
  itineraries: Itineraries
  aiPins?: AiPin[]
  route?: DirectionsResult | null
  onRoute?: (r: DirectionsResult | null) => void
  onAskAi: () => void
  onDirections: () => void
  dirOpen: boolean
  onSaved: () => void
}

/**
 * The map screen: full-bleed MapLibre canvas with floating glass panels over it.
 *
 * Desktop lays results on the left and the selected place on the right, and the
 * map pads its camera by both so the pin lands in the visible gap between them
 * (see hooks/useMapInsets). Mobile stacks the same two views into one draggable
 * sheet with three rest heights, and the active one feeds the same padding — so
 * the sheet never covers the pin, dragging it down re-centres, and dragging the
 * map collapses the sheet out of the way.
 */
function MapView({
  mode,
  onModeChange,
  favorites,
  itineraries,
  aiPins,
  route,
  onRoute,
  onAskAi,
  onDirections,
  dirOpen,
  onSaved,
}: Props) {
  // Snorkelling and kayaking are the Vacation-tier upsell (PRICING.md §4).
  // Advisory only — requireTier on the server and the RLS policies in 0022 /
  // 0033 are the real gates. One flag because both sit at the same tier; see
  // the note on useCategoryPlaces' `canWaterZones` parameter.
  const canWaterZones = useFeature('snorkel_zones')
  const canPlanTrips = useFeature('itinerary')
  const isMobile = useIsMobile()
  const safeArea = useSafeArea()
  // Drives the amber dot on the nav's Profile cell — the nudge that used to sit
  // on the top bar's profile button.
  const { credits, hasAccess } = useEntitlement()
  const { pinsSeq } = useAiChat()

  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  /** AI-pin markers. Category pins live in placeMarkersRef, keyed by place id. */
  const markersRef = useRef<maplibregl.Marker[]>([])
  /**
   * Category pins keyed by place id, so a selection change can swap just the
   * two pins whose look changes (old + new selection) instead of tearing down
   * and rebuilding every pin on the map — which is what made them flash.
   */
  const placeMarkersRef = useRef(new Map<string, { marker: maplibregl.Marker; place: Place }>())
  /** The selected id as of the last render, for effects that must not re-run on selection. */
  const selectedIdRef = useRef<string | null>(null)
  /** Owns selection camera moves — see lib/camera.ts for why it has to be one owner. */
  const directorRef = useRef<CameraDirector | null>(null)
  const routeMarkersRef = useRef<maplibregl.Marker[]>([])
  /** The live-location dot — kept out of markersRef so clearMarkers() can't wipe it. */
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  /**
   * The open trip's pins — its own ref for the same reason as userMarkerRef
   * and suggestionMarkerRef: the category marker effect calls clearMarkers()
   * on every `places` change, which would wipe these out from under the user
   * while they still had a trip open.
   */
  const tripMarkersRef = useRef<maplibregl.Marker[]>([])
  /**
   * The id of the trip the camera last fitBounds()-ed to. Lets the trip-pin
   * effect below fit the camera once per opened trip instead of once per
   * `activeTrip` object identity — see the long comment on that effect.
   */
  const fittedTripIdRef = useRef<string | null>(null)
  /**
   * Latest `padding` / `selectPlace` closures, refreshed every render.
   *
   * Both are unstable identities (padding depends on `insets`, which depends
   * on the mobile sheet's snap point; selectPlace depends on padding). The
   * trip-pin effect needs to CALL the current version of each without being
   * forced to re-run every time either identity changes — re-running on
   * padding meant every sheet drag rebuilt every marker and re-fit the
   * camera, and re-running on selectPlace meant tapping a pin flew the
   * camera in (selectPlace) and immediately fought itself back out
   * (the effect re-firing and fitBounds-ing to the whole trip). Reading
   * through a ref decouples "have the freshest function" from "re-run the
   * effect".
   */
  const selectPlaceRef = useRef<(p: Place) => void>(() => {})
  const paddingRef = useRef<() => MapInsets>(() => ({
    top: 0, bottom: 0, left: 0, right: 0,
  }))

  const [styleId, setStyleId] = useState(DEFAULT_MAP_STYLE)
  /** The Map Modes card (basemap + overlays), opened by the globe button. */
  const [modesOpen, setModesOpen] = useState(false)
  const [mapLabels, setMapLabels] = useState(true)
  // Beaches on launch. A null category renders an empty results pane, which
  // reads as "the app failed to load" rather than "pick something" — and
  // beaches are what the island is for. `useCategoryPlaces` fetches from this
  // on mount, so the list is populated by first paint with no extra effect.
  const [category, setCategory] = useState<CategorySlug | null>('beaches')
  const [subSlug, setSubSlug] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)
  /**
   * The place a search hit opened, kept in the loaded set even when the list
   * it lands in is a "Top" 5 that doesn't contain it (a beach or stay ranked
   * 6th+). Without this the camera flies to a place with no pin and no row.
   * Cleared by any category or chip pick — those ask for a different list.
   */
  const [hitPlace, setHitPlace] = useState<Place | null>(null)
  const [sort, setSort] = useState<SortKey>('nearest')
  const [tourFilter, setTourFilter] = useState<'all' | 'tours'>('all')
  /** Zone legend for whichever water activity is selected — snorkel or kayak. */
  const [zoneLegend, setZoneLegend] = useState<
    { label: string | null; color: string | null; description: string | null }[]
  >([])
  /** The latest fix from the location watch below, accuracy included (Cards radar). */
  const [userFix, setUserFix] = useState<CardPosition | null>(null)
  /** The watch failed with PERMISSION_DENIED — the radar pill says so (S-2). */
  const [locationBlocked, setLocationBlocked] = useState(false)
  const userLoc = useMemo<[number, number] | null>(
    () => (userFix ? [userFix.lng, userFix.lat] : null),
    [userFix],
  )
  /** Vieques Cards radar (S-1/S-2). Off on every load: switching it on is the
   *  tap that unlocks sound (I-1). Phone layout only until step 10 (S-10). */
  const [radarOn, setRadarOn] = useState(false)
  const cardRadar = useCardRadar({ on: radarOn && isMobile, fix: userFix, locationBlocked })
  /** Revealed + owned cards to pin while the radar is on (S-3, P-2, P-5). */
  const cardPins = useCardPins({ on: radarOn && isMobile, revealed: cardRadar.revealed })
  /**
   * The card whose detail is open. Card detail (S-7) arrives in step 8; until
   * then a tap only marks the pin selected (marker-lift + pulse), and a second
   * tap on the same pin clears it.
   */
  const [openCardSlug, setOpenCardSlug] = useState<string | null>(null)
  // Desktop: the results panel is folded to an edge tab. The category and its
  // results survive — this is "get out of my way", not "close".
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  /** The trip+day picker, opened from a place card or the detail panel. */
  const [addToTripFor, setAddToTripFor] = useState<Place | null>(null)
  /**
   * Suggestion of the Day, held separately from `selected`.
   *
   * Its own state and its own marker because the category marker effect calls
   * clearMarkers() — a suggestion pin parked in `markersRef` would be wiped the
   * next time the result set changed, which is exactly when the user is looking
   * at the map.
   */
  const [suggestionPin, setSuggestionPin] = useState<Place | null>(null)
  const suggestionMarkerRef = useRef<maplibregl.Marker | null>(null)

  // Mobile sheet geometry. The sheet's *visible* height drives the map's bottom
  // padding, so a pin never ends up underneath it.
  //
  // Starts at PREVIEW to match the default `category` above. This used to open
  // at HIDDEN so the app showed a bare map — but the two settings have to
  // agree: preloading beaches into a sheet the user cannot see is the same
  // blank first screen with an extra fetch. PREVIEW is the peek height, so the
  // map is still the larger half.
  const [snap, setSnap] = useState<string | number | null>(SHEET_PREVIEW)

  const part = daypart()
  const { suggestion, loading: loadingSuggestion, next: nextSuggestion } = useSuggestion(part)

  const { places: rawPlaces, subcategories, loading, locked, error, activeSub } = useCategoryPlaces(
    category,
    subSlug,
    canWaterZones,
    tourFilter,
    {},
    sort === 'all',
  )

  /**
   * Island-wide search index — every category, fetched once on first focus.
   *
   * Separate from `rawPlaces` on purpose: that is the category the user is
   * *looking at*, and search has to find things they have not navigated to yet.
   */
  const islandSearch = useIslandSearch()

  // `activeSub` (what the hook actually fetched), not the raw pick — one
  // source of truth if a category ever gains a default pick.
  const snorkelling = category === 'activities' && activeSub === 'snorkeling'
  const kayaking = category === 'activities' && activeSub === 'kayaking'
  /**
   * The two activities that are a spots-plus-zones dataset *and* have tour
   * companies in the directory — so both get the "Go Yourself / Book a Tour"
   * toggle. Mirrors WATER_SUBS in useCategoryPlaces, which decides the fetch;
   * this decides whether the control is drawn. Hiking is the counterexample:
   * its own dataset, but nobody sells a guided trail listing yet.
   */
  const waterActivity = snorkelling || kayaking

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
    // No `offers_tours` filter here any more. The toggle now selects which
    // dataset useCategoryPlaces fetches — spots vs operators — so by the time
    // rows arrive they are already the right kind. Filtering on `offers_tours`
    // at this layer was what made "Book a Tour" show snorkel spots: it could
    // only ever narrow the spot list, never reach the companies.
    const sorted =
      // Only while its panel is open: back/close returns to a true Top 5.
      hitPlace &&
      selected?.id === hitPlace.id &&
      !loading &&
      !error &&
      !rawPlaces.some((p) => p.id === hitPlace.id)
        ? [...rawPlaces, hitPlace]
        : [...rawPlaces]
    sorted.sort((a, b) => {
      // Paid "Top" placements stay first, in the slot order the server sent
      // (Array.sort is stable, so equal keys keep that order). Re-sorting a
      // bought slot by distance would sell a position we don't deliver.
      if (a.sponsored || b.sponsored) return (b.sponsored ? 1 : 0) - (a.sponsored ? 1 : 0)
      if (sort === 'name' || sort === 'all') return a.name.localeCompare(b.name)
      const da = distances.get(a.id)
      const db = distances.get(b.id)
      // Without geolocation "nearest" has nothing to sort on — fall back to
      // name so the order is at least stable and predictable.
      if (da == null || db == null) return a.name.localeCompare(b.name)
      return da - db
    })
    return sorted
  }, [rawPlaces, hitPlace, selected, loading, error, sort, distances])

  // Collapsed counts as closed for the camera: the map really does have that
  // width back, and padding for a panel that isn't there parks pins off-centre.
  //
  // No longer `category != null`: the desktop left panel is now always mounted
  // in Explore (it carries the search bar), so it occupies that width whether
  // or not a category is loaded — and the camera has to know, or every pin
  // frames itself underneath the panel on a cold start.
  // Saved takes the same slot at the same width, so it counts too.
  const resultsOpen = !isMobile
    ? mode === 'saved' || !resultsCollapsed
    : category != null && !resultsCollapsed
  const detailOpen = selected != null

  /**
   * Visible sheet height, derived from the active snap point.
   *
   * Not measured off the element: in snap mode vaul gives the drawer a
   * full-viewport box and slides it with a transform, so its bounding height is
   * always the max-height regardless of where it rests. Measuring it made the
   * bottom inset a constant — the map padded for a full-screen sheet even when
   * the sheet was at preview, which pushed every pin into the top of the canvas.
   * The snap point is the number that actually describes what's covered.
   *
   * This is only true because ui/ResponsivePanel caps the drawer at
   * `max-h-[100dvh]`. vaul translates by `innerHeight - snapValue`, so a smaller
   * cap makes the real height `snapValue - (100dvh - cap)` and this number is
   * silently too large by the difference. It was `94dvh` — ~51px of error at
   * 844px, applied to every camera move. Do not change that class without
   * changing this.
   */
  const sheetHeight = useMemo(() => {
    if (!isMobile) return 0
    if (typeof snap === 'number') return snap * window.innerHeight
    if (typeof snap === 'string') return parseFloat(snap) || 0
    return 0
  }, [isMobile, snap])

  /**
   * How much chrome sits above the map right now.
   *
   * Recomputed from what is actually on screen rather than read off one
   * constant: the greeting card is only shown in Explore, only the phone has a
   * category row, and minimising the card genuinely returns 60px. The camera
   * should know about all three, and before this it knew about none of them —
   * nor about the 47px notch.
   */
  const topInset = useMemo(() => {
    if (!isMobile) return undefined
    return mobileTopInset({
      safeTop: safeArea.top,
      bento: mode === 'explore',
    })
  }, [isMobile, safeArea.top, mode])

  const insets = useMapInsets({
    resultsOpen,
    detailOpen,
    // The mobile sheet is always mounted now, so its height always counts.
    sheetHeight,
    topInset,
    safeBottom: safeArea.bottom,
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
    directorRef.current = new CameraDirector(map)
    return () => {
      clearTimeout(t)
      map.remove()
      mapRef.current = null
      directorRef.current = null
    }
  }, [])

  // Reaching for the map means you want to see the map. Drop the sheet to its
  // collapsed stop so the pan isn't happening in the top third of the screen.
  //
  // Gated on `originalEvent`: every flyTo / easeTo / fitBounds in this file also
  // fires `dragstart`-adjacent movement events, and collapsing the sheet in
  // response to our own camera work would fight the user constantly. Only a
  // real gesture carries the DOM event.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMobile) return
    const onDrag = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) setSnap(SHEET_HIDDEN)
    }
    map.on('dragstart', onDrag)
    return () => {
      map.off('dragstart', onDrag)
    }
  }, [isMobile])

  const changeStyle = (id: string) => {
    if (!mapRef.current || id === styleId) return
    mapRef.current.setStyle(styleUrl(id))
    setStyleId(id)
  }

  /**
   * The Labels toggle in Map Modes: hide the basemap's own text.
   *
   * Applied by walking the style's symbol layers rather than by loading a
   * separate "no labels" style URL — MapTiler does not publish one per basemap,
   * and swapping styles would tear down and rebuild every marker layer we own.
   *
   * `place_`/`poi_` are excluded from nothing here on purpose: the intent is
   * "quiet the map so my pins read", and our own pins are HTML markers, not
   * style layers, so they are untouched by this.
   *
   * Re-runs on `styleId` because setStyle replaces the layer list wholesale — a
   * basemap switch would otherwise silently bring the labels back. `styledata`
   * is the event that fires once the new style's layers actually exist.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => {
      const style = map.getStyle()
      if (!style?.layers) return
      for (const layer of style.layers) {
        if (layer.type !== 'symbol') continue
        map.setLayoutProperty(layer.id, 'visibility', mapLabels ? 'visible' : 'none')
      }
    }

    if (map.isStyleLoaded()) apply()
    map.on('styledata', apply)
    return () => {
      map.off('styledata', apply)
    }
  }, [mapLabels, styleId])

  // Follow the user's location for as long as the map is mounted. Denial is
  // fine — distance labels simply don't render rather than showing a made-up
  // number, and the blue dot below stays off the map.
  //
  // watchPosition rather than a single getCurrentPosition: the dot is only
  // honest if it keeps up while you drive across the island, and the browser
  // fires the first fix immediately either way. enableHighAccuracy is on
  // because a ~1km network fix is useless for "which beach am I standing on".
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationBlocked(false)
        setUserFix({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        })
      },
      // Only a denial is worth telling anyone about (the Cards radar pill);
      // timeouts and "unavailable" just keep waiting for the next fix.
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationBlocked(true)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // The blue "you are here" dot. Its own ref and its own effect, for the same
  // reason as suggestionMarkerRef — clearMarkers() wipes markersRef every time
  // the result set changes, and the user's own position should outlive that.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLoc) return

    const marker = new maplibregl.Marker({
      element: makeUserDotEl(),
      anchor: 'center',
    })
      .setLngLat(userLoc)
      .addTo(map)
    userMarkerRef.current = marker

    return () => {
      marker.remove()
      userMarkerRef.current = null
    }
    // No readiness flag in the deps: the lifecycle effect above assigns
    // mapRef.current synchronously and is declared first, so it has already
    // run by the time this one does. Markers may be added before 'load' —
    // MapLibre queues them onto the canvas itself, not onto a style layer.
  }, [userLoc])

  // ---------------------------------------------------------------------------
  //  Vieques Cards — card pins + collect ring (S-3, P-1…P-5)
  // ---------------------------------------------------------------------------

  /**
   * Card pins, keyed by slug, with the look they were built with so an update
   * rebuilds only the pins that changed. Their own ref (P-1): clearMarkers()
   * never touches them, and nothing here hides or gates category or AI pins.
   */
  const cardMarkersRef = useRef(new Map<string, { marker: maplibregl.Marker; look: string }>())
  /** Slugs that already had their one "revealed just now" pulse. */
  const cardPulsedRef = useRef(new Set<string>())

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const live = cardMarkersRef.current
    const wanted = new Set(cardPins.cards.map((c) => c.slug))

    const drop = (slug: string) => {
      const entry = live.get(slug)
      if (!entry) return
      disposeCardMarkerEl(entry.marker.getElement())
      entry.marker.remove()
      live.delete(slug)
    }
    for (const slug of [...live.keys()]) if (!wanted.has(slug)) drop(slug)
    // Radar off (P-2): the next switch-on may pulse a fresh reveal again.
    if (cardPins.cards.length === 0) cardPulsedRef.current.clear()

    for (const c of cardPins.cards) {
      if (!c.location) continue // P-5: only cards the server located for us
      const state = cardPinState(c)
      const selected = c.slug === openCardSlug
      const look = `${state}|${c.rarity}|${selected}|${c.serialNo}|${c.location.center.join(',')}`
      if (live.get(c.slug)?.look === look) continue
      drop(c.slug)

      // "Revealed just now": one marker-pulse, never a camera move (M-1).
      const fresh = cardPins.fresh.has(c.slug) && !cardPulsedRef.current.has(c.slug)
      if (fresh) cardPulsedRef.current.add(c.slug)

      const el = makeCardMarkerEl({
        rarity: c.rarity,
        state,
        label: cardPinLabel(c.rarity, c.name),
        selected,
        fresh,
      })
      el.addEventListener('click', (e) => {
        e.stopPropagation() // P-3: a card tap never reaches the map
        setOpenCardSlug((cur) => (cur === c.slug ? null : c.slug))
      })
      if (state === 'owned' && c.name) {
        // Art crop of the generated face (S-11). Dynamic import keeps the
        // face generator out of the map's first load (C-3).
        const face = { ...c, name: c.name }
        void import('../lib/cardFace')
          .then((m) => m.cardFrontUrl(face))
          .then((url) => setCardPinArt(el, url))
          .catch(() => undefined) // the rim-coloured card stays
      }
      live.set(c.slug, {
        marker: new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(c.location.center)
          .addTo(map),
        look,
      })
    }
  }, [cardPins, openCardSlug])

  // Unmount (P-2): take every card pin with the map.
  useEffect(() => {
    const live = cardMarkersRef.current
    return () => {
      live.forEach(({ marker }) => {
        disposeCardMarkerEl(marker.getElement())
        marker.remove()
      })
      live.clear()
    }
  }, [])

  /**
   * The one card that gets a collect ring (S-3, P-4): the nearest revealed
   * card you could collect, within reveal range of your fix. Owned, locked
   * and sold-out cards have nothing to collect, so no ring. Distance from
   * your own fix to a card the server already located for you (P-5).
   */
  const ringSlug = useMemo(() => {
    if (!userFix) return null
    let best: string | null = null
    let bestM = Infinity
    for (const c of cardPins.cards) {
      if (!c.location || c.owned || c.lockedByTier || c.soldOut) continue
      const m = milesBetween([userFix.lng, userFix.lat], c.location.center) * METRES_PER_MILE
      if (m <= CARD_RING_RANGE_M && m < bestM) {
        best = c.slug
        bestM = m
      }
    }
    return best
  }, [cardPins.cards, userFix])
  // Keyed by slug so a GPS tick that doesn't change the answer doesn't redraw.
  const ringCard = useMemo(
    () => cardPins.cards.find((c) => c.slug === ringSlug) ?? null,
    [cardPins.cards, ringSlug],
  )

  // Collect ring GL layers, redrawn when the basemap changes (trails pattern,
  // P-4) and removed with the radar. No camera move, ever (M-1).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const location = ringCard?.location
    if (!ringCard || !location) {
      removeCardRing(map)
      return
    }
    const ring = { rarity: ringCard.rarity, radiusM: location.radiusM, center: location.center }
    // setStyle drops our layers, and right after it the OLD style can still
    // report loaded; the new one's last `styledata` can also arrive before
    // its sprite has, while isStyleLoaded() is still false. So draw now if we
    // can, then re-add on `styledata` / `idle` whenever the style is loaded
    // and the ring is gone. Only re-adds — an update here would fire
    // styledata again. The check is one getSource() lookup.
    const ensure = () => {
      if (map.isStyleLoaded() && !hasCardRing(map)) drawCardRing(map, ring)
    }
    if (map.isStyleLoaded()) drawCardRing(map, ring)
    map.on('styledata', ensure)
    map.on('idle', ensure)
    return () => {
      map.off('styledata', ensure)
      map.off('idle', ensure)
    }
  }, [ringCard, styleId])

  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    placeMarkersRef.current.forEach(({ marker }) => marker.remove())
    placeMarkersRef.current.clear()
  }

  // ---------------------------------------------------------------------------
  //  Selection
  // ---------------------------------------------------------------------------

  const selectPlace = useCallback(
    (p: Place) => {
      setSelected(p)
      setSnap(SHEET_PREVIEW)
      const map = mapRef.current
      const director = directorRef.current
      if (!map || !director || !isMappable(p)) return
      if (p.geometry) {
        // Zooming to a fixed 15 on the trailhead would put a 3-mile trail's far
        // end off screen. Frame the whole line instead — and cap the zoom so a
        // 100 m spur doesn't slam the camera into max zoom. Flat on purpose:
        // cameraForBounds fits for pitch 0, so a tilted trail would overrun.
        const b = new maplibregl.LngLatBounds()
        p.geometry.coordinates.forEach((c) => b.extend(c))
        director.fly(
          { target: { type: 'bounds', bounds: b, maxZoom: 16 }, pitch: 0, bearing: map.getBearing() },
          padding(),
        )
      } else {
        director.fly(
          pointShot([p.longitude, p.latitude], {
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
          }),
          padding(),
        )
      }
      // Snorkel and kayak spots carry zone polygons; drawing them is the point
      // of the Vacation tier, so load them as soon as one is picked. Identical
      // handling either side — only the namespace and the fetch differ.
      if (p.kind === 'snorkel' || p.kind === 'kayak') {
        const ns = p.kind
        const load = ns === 'snorkel' ? fetchSnorkelZones : fetchKayakZones
        load((p.raw as { id: string }).id)
          .then((fc) => {
            if (!mapRef.current) return
            drawZones(mapRef.current, ns, fc)
            setZoneLegend(
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

  // Keep selectPlaceRef/paddingRef pointed at the latest closures every
  // render, so effects that read `*Ref.current(...)` (see the trip-pin
  // effect below) always call fresh logic without needing padding/selectPlace
  // themselves in their dep arrays.
  useEffect(() => {
    selectPlaceRef.current = selectPlace
    paddingRef.current = padding
    selectedIdRef.current = selected?.id ?? null
  })

  const clearSelection = useCallback(() => {
    setSelected(null)
    setSnap(SHEET_PREVIEW)
    const map = mapRef.current
    if (map) {
      removeAllZones(map)
      setZoneLegend([])
      directorRef.current?.settle(paddingRef.current())
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
      setHitPlace(null)
      setSelected(null)
      // Tapping the category you are already in toggles the sheet rather than
      // reloading the same list — a second tap on "Beaches" means "show me the
      // map"/"show me the list", which is the gesture the pill is nearest to.
      setSnap((cur) =>
        slug != null && slug === category && cur !== SHEET_HIDDEN ? SHEET_HIDDEN : SHEET_PREVIEW,
      )
      // Picking a category is an Explore action — if the user was reading the
      // chat or their profile, the results they just asked for must be what the
      // sheet shows.
      onModeChange('explore')
      // Asking for a category is asking to see its results — a collapse left
      // over from the previous one would silently swallow the click.
      setResultsCollapsed(false)
      setTourFilter('all')
      setZoneLegend([])
      directorRef.current?.release()
      const map = mapRef.current
      if (map) {
        removeAllZones(map)
        removeTrails(map)
      }
    },
    [category, onModeChange],
  )

  /**
   * Open a search hit that may belong to a category the app is not in.
   *
   * Selecting the place is not enough on its own: the detail panel would show
   * the right place while the results list behind it still held the old
   * category, and the marker effect draws `places` — so the pin the user just
   * flew to would not be on the map. Setting the category and subcategory
   * first makes the hit a normal member of the loaded set, and the panel
   * behind it the list it actually came from.
   *
   * `selectCategory` is deliberately not reused here: it clears `selected` and
   * resets the subcategory, which is exactly what a *pill* tap means and
   * exactly the opposite of this. Here the destination is the point.
   */
  const openSearchHit = useCallback(
    (hit: SearchHit) => {
      setCategory(hit.category)
      setSubSlug(hit.sub)
      setHitPlace(hit.place)
      setTourFilter('all')
      setResultsCollapsed(false)
      setZoneLegend([])
      // A hit is an Explore result; if the user searched from the chat or
      // their profile, the sheet has to come back to the map.
      onModeChange('explore')
      const map = mapRef.current
      if (map) {
        removeAllZones(map)
        removeTrails(map)
      }
      selectPlace(hit.place)
    },
    [onModeChange, selectPlace],
  )

  /**
   * Drop a suggestion on the map as its own pin.
   *
   * Not routed through `selectPlace`: a suggestion is not in `places`, so the
   * marker effect would never draw it, and `selected` is what the detail panel
   * shows. This sets both — the pin comes from its own effect (see
   * suggestionMarkerRef) and the panel gets the copy.
   */
  const openSuggestion = useCallback(
    (s: Suggestion) => {
      const place = suggestionToPlace(s)
      setSuggestionPin(place)
      onModeChange('explore')
      // Advice with no coordinates ("cash still runs this island") still has
      // something to say, so show the panel — there is just no pin to fly to.
      const map = mapRef.current
      if (isMappable(place)) {
        setSelected(place)
        setSnap(SHEET_PREVIEW)
        if (map) {
          directorRef.current?.fly(
            pointShot([place.longitude, place.latitude], {
              zoom: map.getZoom(),
              pitch: map.getPitch(),
              bearing: map.getBearing(),
            }),
            padding(),
          )
        }
      } else {
        setSelected(place)
        setSnap(SHEET_PREVIEW)
      }
    },
    [onModeChange, padding],
  )

  // ---------------------------------------------------------------------------
  //  Mode guards
  // ---------------------------------------------------------------------------

  /**
   * A reply that carried pins drops the sheet so the user can see them (§8).
   *
   * Keyed on the counter rather than the array: two consecutive answers can
   * legitimately return the same pins, and that second answer still needs to
   * reveal the map.
   *
   * Adjusted during render against the last value seen rather than in an effect
   * — the pattern React documents for "derive state from a changed input". An
   * effect would collapse the sheet one painted frame later, so the user would
   * see the full-height chat repaint before it dropped.
   */
  const [seenPinsSeq, setSeenPinsSeq] = useState(pinsSeq)
  if (pinsSeq !== seenPinsSeq) {
    setSeenPinsSeq(pinsSeq)
    if (mode === 'ai') setSnap(SHEET_HIDDEN)
  }

  /** Switching mode starts that mode at the height it is useful at. */
  const changeMode = useCallback(
    (next: ShellMode) => {
      if (next === mode) {
        // Tapping the cell you are on is "let me see the map".
        setSnap((cur) => (cur === SHEET_HIDDEN ? SHEET_PREVIEW : SHEET_HIDDEN))
        return
      }
      onModeChange(next)
      // A place selected in Explore has no meaning in the chat or the profile,
      // and leaving it set would render a detail panel instead of the mode.
      setSelected(null)
      // Same for Map Modes, which outranks every mode in the sheet body: left
      // open, tapping Ask AI would show the basemap picker under the AI title.
      setModesOpen(false)
      setSnap(
        // Menu opens full too: at PREVIEW the Log Out row sits under the nav.
        next === 'ai' || next === 'profile' || next === 'menu'
          ? SHEET_FULL
          : next === 'saved'
            ? SHEET_PREVIEW
            : category
              ? SHEET_PREVIEW
              : SHEET_HIDDEN,
      )
    },
    [mode, onModeChange, category],
  )

  // ---------------------------------------------------------------------------
  //  Markers — one effect for every category
  // ---------------------------------------------------------------------------

  /** One category pin. Clicks go through selectPlaceRef so a pin never holds a stale closure. */
  const addPlaceMarker = (map: maplibregl.Map, p: Place, isSelected: boolean) => {
    const el = makeMarkerEl(p.icon, isSelected)
    // The lift-in plays on the badge (inner node) — MapLibre owns the outer
    // element's transform. Only for the selected pin, and CSS turns it off
    // under reduced motion.
    if (isSelected) el.lastElementChild?.classList.add('marker-lift')
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      selectPlaceRef.current(p)
    })
    // Callers only pass places that passed isMappable(), so both are set.
    return new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([p.longitude as number, p.latitude as number])
      .addTo(map)
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // AI pins own the map while they're up; don't fight them.
    if (aiPins && aiPins.length > 0) return

    clearMarkers()
    places.filter(isMappable).forEach((p) => {
      placeMarkersRef.current.set(p.id, {
        marker: addPlaceMarker(map, p, p.id === selectedIdRef.current),
        place: p,
      })
    })
    // Selection is deliberately not a dep — the effect below swaps only the
    // pins whose look changed. selectedIdRef carries it in for a fresh build.
  }, [places, aiPins])

  // Selection changed: rebuild the outgoing and incoming pins only. Every
  // other pin keeps its DOM node, so nothing on the map blinks.
  const shownSelectionRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    const next = selected?.id ?? null
    const prev = shownSelectionRef.current
    shownSelectionRef.current = next
    if (!map || prev === next) return
    for (const id of [prev, next]) {
      const entry = id ? placeMarkersRef.current.get(id) : undefined
      if (!entry) continue
      entry.marker.remove()
      entry.marker = addPlaceMarker(map, entry.place, id === next)
    }
  }, [selected?.id])

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
    const key = `${category}:${activeSub}:${mappable.map((p) => p.id).join(',')}`
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
    // A new result set is an overview: drop any selection shot and lay the
    // map flat, or a tilted fly-in would carry over into the island view.
    directorRef.current?.release()
    map.fitBounds(bounds, { padding: padding(), maxZoom: 14, pitch: 0 })
  }, [places, category, activeSub, aiPins, padding])

  // Re-centre when the chrome moves: a panel opens/closes, or the mobile sheet
  // snaps to a new height. This single effect is the whole "swipe down and the
  // pin comes back" behaviour.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // At the full snap there are ~60px of map left. Re-centring into that strip
    // means an easeTo that visibly zooms out to nothing every time the user
    // opens the sheet to read something — so leave the camera where it was and
    // let the next snap down bring the pin back.
    if (isMobile && snap === SHEET_FULL) return
    const pad = padding()
    // A selection the director flew to: let it re-aim that shot. This is the
    // fix for "tapping a pin doesn't zoom" — the old easeTo below carried no
    // zoom and cancelled the fly-in the sheet snap had just interrupted.
    // Also covers the trip home after ✕ (selected is already null by then).
    const director = directorRef.current
    if (director?.active) {
      director.reframe(pad)
      return
    }
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
    directorRef.current?.release()
    map.fitBounds(bounds, { padding: padding(), maxZoom: 15, pitch: 0 })
    // padding is deliberately omitted: re-framing AI pins every time a panel
    // moves would yank the camera away from what the user is reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPins])

  /**
   * The Suggestion of the Day pin.
   *
   * Its own effect and its own ref, deliberately not part of `markersRef`: the
   * category marker effect calls clearMarkers() whenever the result set changes,
   * which would silently wipe the suggestion the moment the user touched a
   * filter or a subcategory chip. Kept separate, it survives until replaced.
   */
  useEffect(() => {
    const map = mapRef.current
    suggestionMarkerRef.current?.remove()
    suggestionMarkerRef.current = null
    if (!map || !suggestionPin || !isMappable(suggestionPin)) return

    const el = makeMarkerEl(suggestionPin.icon, suggestionPin.id === selected?.id, 'suggestion')
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      setSelected(suggestionPin)
      setSnap(SHEET_PREVIEW)
    })
    suggestionMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([suggestionPin.longitude, suggestionPin.latitude])
      .addTo(map)
  }, [suggestionPin, selected?.id])

  /**
   * The open trip's places, as pins.
   *
   * Snapshots carry coordinates, so a trip draws its whole map in one pass
   * with no per-place lookup. Items with no coordinates (a snapshot written
   * before a place had them) are skipped rather than dropped at 0,0 in the
   * Atlantic. Clicking a pin selects that place exactly like any other pin —
   * it opens the detail panel via `selectPlace`, which flies/fits the camera
   * to it, same as the results list.
   *
   * Kept in `tripMarkersRef`, not `markersRef`: the category marker effect
   * calls clearMarkers() on every `places` change, which would wipe these out
   * from under the user the moment they touched a filter chip. The cleanup
   * below — removing every marker it added — is what makes "back clears the
   * pins" work with no extra code: leaving a trip (activeTrip -> null) reruns
   * this effect, and the cleanup from the previous run fires first.
   *
   * Deps are deliberately just `[itineraries.activeTrip]`, not padding or
   * selectPlace (see selectPlaceRef/paddingRef above for why those two are
   * unstable). `padding()` and `selectPlace` are read through the refs
   * instead, so a sheet drag or a pin tap — both of which change padding's
   * identity — rebuild nothing here.
   *
   * The camera fit is further gated on `fittedTripIdRef`, keyed on the trip's
   * id rather than on `activeTrip` object identity: applyDetail() in
   * useItineraries hands back a brand-new TripDetail object after every
   * add/move/remove, so fitting on identity would re-frame the whole trip
   * every time a single place was added or dragged to another day. Markers
   * still rebuild on every items change (a new place needs a new pin) — only
   * the fitBounds is once-per-trip.
   */
  useEffect(() => {
    const map = mapRef.current
    tripMarkersRef.current.forEach((m) => m.remove())
    tripMarkersRef.current = []
    if (!map || !itineraries.activeTrip) {
      fittedTripIdRef.current = null
      return
    }

    const tripPlaces = itineraries.activeTrip.items
      .map(tripItemToPlace)
      .filter(isMappable)

    if (tripPlaces.length === 0) return

    const markers = tripPlaces.map((p) => {
      const el = makeMarkerEl(p.icon)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        selectPlaceRef.current(p)
      })
      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.longitude, p.latitude])
        .addTo(map)
    })
    tripMarkersRef.current = markers

    if (fittedTripIdRef.current !== itineraries.activeTrip.id) {
      fittedTripIdRef.current = itineraries.activeTrip.id
      const b = new maplibregl.LngLatBounds()
      tripPlaces.forEach((p) => b.extend([p.longitude, p.latitude]))
      directorRef.current?.release()
      map.fitBounds(b, { padding: paddingRef.current(), maxZoom: 14, pitch: 0 })
    }

    return () => {
      markers.forEach((m) => m.remove())
      tripMarkersRef.current = []
    }
  }, [itineraries.activeTrip])

  // Draw the directions route when one is provided; clear it when null.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // The route frames itself; don't let a trip home (✕ fires just before
    // this when Directions closes the place) pull the camera off it.
    if (route) directorRef.current?.release()
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

  const accent = category ? categoryMeta(category).color : undefined

  /**
   * The sheet is at its lowest stop, where §5 wants the search bar and nothing
   * else.
   *
   * Everything below it — the layers chip, the filter row, the results — is
   * withheld rather than merely covered. The bottom nav is frosted glass, not
   * opaque, so content left mounted underneath it shows through as unreadable
   * ghost text rather than disappearing.
   */
  const sheetCollapsed = isMobile && snap === SHEET_HIDDEN

  const searchBar = (
    <MapSearchBar
      places={places}
      onSelect={selectPlace}
      // Search now runs against the whole-island index rather than the loaded
      // category, so it is never disabled. It used to be (`disabled={!category}`),
      // which made the pills the only way to get anything on screen — and on
      // desktop, any moment where those pills are unreachable left the app with
      // no working input at all. That was the dead end; searching every category
      // is what removes it, rather than a better message on a dead field.
      index={islandSearch}
      onIndexStart={islandSearch.start}
      onSelectHit={openSearchHit}
      placeholder={
        category ? `Search ${categoryMeta(category).label.toLowerCase()}…` : 'Search the island…'
      }
      styleId={styleId}
      onStyleChange={changeStyle}
      compact={isMobile}
      // Focusing the field opens the sheet all the way (§5's "hitting search
      // opens the panel"), a beat earlier than submitting would — the results
      // are then already visible as you type.
      //
      // It also sidesteps a vaul bug. Its keyboard-repositioning code guards on
      // `if (… && activeSnapPointIndex)`, and index 0 is falsy, so at the lowest
      // snap it skips the active-snap term and writes a wrong height directly to
      // the element. Promoting on focus means the keyboard only ever opens at
      // index 2, where that maths is correct.
      onFocusChange={(focused) => {
        if (focused && isMobile) setSnap(SHEET_FULL)
      }}
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
      {/* Same gate for kayaking, and since 0038 the same toggle too: kayak tour
          companies are activity_listings rows tagged 'kayaking', exactly as
          snorkel ones are tagged 'snorkeling'. One company tagged both appears
          under both. */}
      {kayaking && locked && (
        <UpsellOverlay
          feature="kayak_zones"
          title="Kayaking zone maps"
          blurb="Every put-in on the island with the hazards, wildlife areas and routes mapped — plus what the water is doing before you launch."
        />
      )}
      {waterActivity && !locked && (
        <div className="flex gap-1 rounded-2xl border border-white/6 bg-white/3 p-1">
          {(['all', 'tours'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                if (f === tourFilter) return
                setTourFilter(f)
                // The two halves are different datasets, so anything held over
                // from the other one is stale: a selected spot (and the zone
                // polygons it drew) means nothing once the list is companies,
                // and vice versa. Same cleanup selectCategory does.
                setSelected(null)
                setZoneLegend([])
                const map = mapRef.current
                if (map) removeAllZones(map)
              }}
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
      {zoneLegend.length > 0 && (
        <div className="rounded-2xl border border-white/6 bg-white/3 p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {kayaking ? 'Kayak zones' : 'Snorkel zones'}
          </div>
          <ul className="space-y-1.5">
            {zoneLegend.map((z, i) => (
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
  const hasBanner = snorkelling || kayaking || zoneLegend.length > 0

  const results = category && (
    <ResultsList
      category={category}
      places={places}
      loading={loading}
      selectedId={selected?.id ?? null}
      onSelect={selectPlace}
      subcategories={subcategories}
      activeSub={activeSub}
      onSelectSub={(s) => {
        // Tapping a chip while viewing All means "narrow to this" — leave All.
        if (sort === 'all') setSort('name')
        setSubSlug(s)
        setHitPlace(null)
        clearSelection()
      }}
      sort={sort}
      onSortChange={setSort}
      distances={distances}
      onClose={isMobile ? undefined : () => selectCategory(null)}
      onCollapse={isMobile ? () => setSnap(SHEET_HIDDEN) : () => setResultsCollapsed(true)}
      collapseDirection={isMobile ? 'down' : 'left'}
      banner={hasBanner ? banner : undefined}
      error={error}
      savedIds={favorites.ids}
      onToggleSave={favorites.toggle}
      navPad={isMobile}
    />
  )

  /**
   * The search field above the results in both layouts. Order below it is
   * search → glass sub-category slider → count + sort → list (ResultsList).
   * The old tag-chip row (FilterRow, lib/filters.ts) sat between search and the
   * slider — two pill rows doing overlapping jobs — and was removed 2026-11-14.
   * With a category open the category's accent hairline is the divider, so the
   * border only shows when there is no list underneath.
   */
  const exploreHeader = (
    <div
      className={`shrink-0 px-4 pb-3 pt-1 sm:p-4 ${
        sheetCollapsed || category ? '' : 'border-b border-white/8'
      }`}
    >
      {searchBar}
    </div>
  )

  /**
   * What the mobile sheet is showing.
   *
   * One surface, six states. A selected place wins over the mode because it is
   * a drill-down *within* whichever list produced it — its Back button returns
   * to that list, not to Explore.
   *
   * Map Modes outranks all of them: it is a modal errand — pick a basemap, come
   * back — and whatever is underneath is still there when it closes.
   */
  const sheetBody = modesOpen ? (
    <MapModesBody
      onClose={() => setModesOpen(false)}
      styleId={styleId}
      onStyleChange={changeStyle}
      labels={mapLabels}
      onLabelsChange={setMapLabels}
    />
  ) : selected ? (
    <PlaceDetailPanel
      place={selected}
      onClose={clearSelection}
      onBack={clearSelection}
      onCollapse={() => setSnap(SHEET_HIDDEN)}
      onGetDirections={onRoute ? handleDirections : undefined}
      saved={favorites.ids.has(selected.id)}
      onToggleSave={favorites.toggle}
      onAddToTrip={setAddToTripFor}
      extra={detailExtra(selected)}
      navPad
      {...detailLayout(selected)}
    />
  ) : mode === 'ai' ? (
    <AiChatBody navPad />
  ) : mode === 'saved' ? (
    <SavedBody
      favorites={favorites}
      itineraries={itineraries}
      selectedId={null}
      onSelect={selectPlace}
      distances={distances}
      navPad
      tripsLocked={!canPlanTrips}
      onAddToTrip={setAddToTripFor}
    />
  ) : mode === 'profile' ? (
    <ProfileBody navPad />
  ) : mode === 'menu' ? (
    <MenuBody
      navPad
      onBuildItinerary={() => changeMode('saved')}
      onDirections={() => {
        // Back to the map first: Directions is an overlay over Explore, and the
        // menu list left open underneath it would be covered chrome.
        changeMode('explore')
        onDirections()
      }}
    />
  ) : (
    <>
      {exploreHeader}
      {sheetCollapsed ? null : category ? (
        results
      ) : (
        // Before, nothing at all rendered on mobile until a category was picked
        // — the app opened to a bare map with no affordance. The search bar above
        // is now always there, and this says what the row of pills is for.
        <p className="px-6 py-10 text-center text-sm leading-relaxed text-muted-foreground">
          Pick a category above, or search the island.
        </p>
      )}
    </>
  )

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {(() => {
        const topBar = (
          <MapTopBar
            active={category}
            onSelect={selectCategory}
            onAskAi={onAskAi}
            aiOpen={mode === 'ai'}
            onDirections={onDirections}
            dirOpen={dirOpen}
            onSaved={onSaved}
            savedOpen={mode === 'saved'}
            onBuildItinerary={() => onModeChange('saved')}
            showCategories={!isMobile}
          />
        )

        // Desktop keeps its own absolutely-positioned banner row.
        if (!isMobile) return topBar

        /* Phone chrome: just TopBento (suggestion + categories in one card)
           flush to the safe-area top. The ☰ menu is now the Menu cell in the
           bottom nav (MenuBody in the sheet). There is no banner above
           any of it — no logo, no Build Itinerary button (that moved into the
           menu) — so the stack starts at `var(--sat)` and the bento sits
           against the top of the screen.

           Everything here floats over the map and must opt back into pointer
           events: the sheet below is a modal Radix dialog, so the body carries
           `pointer-events: none` (see the note in MapTopBar).

           The bento is Explore-only — in the chat or the profile the sheet is
           full-height and it would just be covered chrome. Outside Explore the
           top of the map is now completely clear. */
        return (
          <div
            className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-start gap-1.5 pad-safe-x"
            style={{ top: `calc(var(--sat) + ${CHROME_TOP_PAD}px)` }}
          >
            {mode === 'explore' && (
              <div className="w-full">
                <TopBento
                  suggestion={suggestion}
                  loadingSuggestion={loadingSuggestion}
                  onOpenSuggestion={openSuggestion}
                  onNextSuggestion={() => {
                    void nextSuggestion().then((s) => s && openSuggestion(s))
                  }}
                  activeCategory={category}
                  onSelectCategory={selectCategory}
                />
              </div>
            )}
          </div>
        )
      })()}

      {isMobile ? (
        <>
          <MapSheet
            title={
              modesOpen
                ? 'Map Modes'
                : mode === 'menu'
                  ? 'Menu'
                  : (selected?.name ??
                  (category ? categoryMeta(category).label : 'Explore Vieques'))
            }
            snap={snap}
            onSnapChange={setSnap}
            // Every tab gets a way down to the lowest stop (where the nav
            // returns). Explore's results / place detail carry their own ⌄, and
            // Map Modes its own close, so the sheet adds one only elsewhere.
            onCollapse={
              mode === 'explore' || modesOpen || selected
                ? undefined
                : () => setSnap(SHEET_HIDDEN)
            }
          >
            {sheetBody}
          </MapSheet>
          <BottomNav
            mode={mode}
            onChange={changeMode}
            accent={accent}
            showCreditDot={!hasAccess && credits <= 0}
          />
        </>
      ) : (
        <>
          {/* Saved takes the results panel's slot rather than floating over it:
              it is the same kind of thing — a list of places you pick from — and
              two stacked left panels would just cover each other. */}
          {mode === 'saved' && (
            <ResponsivePanel
              variant="floating"
              side="left"
              title="Saved"
              desktopWidth="sm:w-[344px]"
            >
              <SavedBody
                favorites={favorites}
                itineraries={itineraries}
                selectedId={selected?.id ?? null}
                onSelect={selectPlace}
                distances={distances}
                onClose={() => onModeChange('explore')}
                tripsLocked={!canPlanTrips}
                onAddToTrip={setAddToTripFor}
              />
            </ResponsivePanel>
          )}

          {/* The left panel is no longer gated on `category`.
              It used to be, which meant a cold-start desktop had no panel and
              therefore no search field — the pills were the only input in the
              app, so anything that covered them (see ProfilePanel's backdrop,
              which tied MapTopBar on z-index) left nothing to type into. The
              panel now always exists in Explore and always carries the search
              bar; the results below it are what appear once a category is
              picked. */}
          {mode !== 'saved' && !resultsCollapsed && (
            <ResponsivePanel
              variant="floating"
              side="left"
              title={category ? categoryMeta(category).label : 'Explore Vieques'}
              desktopWidth="sm:w-[344px]"
              onClose={category ? () => selectCategory(null) : undefined}
            >
              {exploreHeader}
              {category ? (
                results
              ) : (
                <p className="px-6 py-10 text-center text-sm leading-relaxed text-muted-foreground">
                  Search for anywhere on the island, or pick a category above.
                </p>
              )}
            </ResponsivePanel>
          )}

          {/* Folded state: a tab where the panel was. It names the category and
              its count so collapsing never costs you the sense of what is on
              the map — and it is the only way back, so it sits exactly where
              the panel's own collapse button was. */}
          {/* Not gated on `category` either, for the same reason: the panel can
              now be collapsed with nothing loaded, and without this that would
              fold away the only search field with no way back to it. */}
          {resultsCollapsed && (
            <button
              onClick={() => setResultsCollapsed(false)}
              className="glass absolute left-5 top-[5.75rem] z-20 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-foreground shadow-2xl hover:bg-white/5"
            >
              <PanelLeftOpen size={16} className="text-muted-foreground" />
              {category ? categoryMeta(category).label : 'Search'}
              {category && (
                <span className="font-mono text-[10px] text-muted-foreground">{places.length}</span>
              )}
            </button>
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
                saved={favorites.ids.has(selected.id)}
                onToggleSave={favorites.toggle}
                onAddToTrip={setAddToTripFor}
                extra={detailExtra(selected)}
                {...detailLayout(selected)}
              />
            </ResponsivePanel>
          )}
        </>
      )}

      {/* Zoom / recentre.
          Mobile: pinned 12px above the sheet's measured top (`--controls-y`,
          written every frame by MapSheet's useSheetMotion), so the buttons ride
          the sheet through a drag and are never under it. They stop at the
          middle stop; going full, the sheet slides over them (z-50 vs z-10).
          This used to be `insets.bottom`, computed from the snap and
          innerHeight — on iPhone that drifted ~40px from where vaul really put
          the sheet and the recentre button sat under it (2026-11-14).
          No opacity/filter on this wrapper: it is an ancestor of glass. */}
      <div
        className={`${isMobile ? 'fixed' : 'absolute'} z-10 flex flex-col gap-2`}
        style={
          isMobile
            ? {
                top: 'var(--controls-y, calc(100dvh - 176px))',
                transform: 'translateY(calc(-100% - 0.75rem))',
                right: '1.25rem',
              }
            : {
                bottom: '1.25rem',
                right: detailOpen ? `${DETAIL_PANEL_W + 40}px` : '1.25rem',
              }
        }
      >
        {/* Map Modes. Sits directly above the zoom stack, where native Maps puts
            its 3D button — the basemap is a property of the view, so its control
            belongs with the other view controls rather than in the ☰ menu.

            Phone only: it opens into the map sheet, and desktop has no sheet.
            Desktop already carries the four-up switcher permanently in the
            results panel, so there is nothing here for it to add. */}
        {isMobile && (
          <GlassButton
            label="Map modes"
            onClick={() => {
              setModesOpen(true)
              // Raise the sheet with it. The body is clipped to the active snap
              // height, so opening this at the collapsed stop would render the
              // thumbnails inside a 168px pill — the panel has to be open for
              // its contents to be visible. PREVIEW rather than FULL: the card
              // is short, and the point of picking a basemap is watching the
              // map change behind it.
              setSnap(SHEET_PREVIEW)
            }}
          >
            <Globe size={20} />
          </GlassButton>
        )}

        {/* 89 = 4 + 40 + 1 (divider) + 40 + 4 */}
        <GlassStack height={89}>
          <button
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-white/8 active:bg-white/12"
          >
            <Plus size={18} />
          </button>
          <div className="h-px w-6 bg-white/12" />
          <button
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-white/8 active:bg-white/12"
          >
            <Minus size={18} />
          </button>
        </GlassStack>
        <GlassButton
          label="Recentre map"
          onClick={() =>
            mapRef.current?.easeTo({
              center: userLoc ?? VIEQUES_CENTER,
              zoom: userLoc ? 14 : 12,
              padding: padding(),
            })
          }
        >
          <LocateFixed size={19} />
        </GlassButton>
        {/* Vieques Cards radar (S-1): last in the stack, below recentre. */}
        {isMobile && (
          <RadarButton
            on={radarOn}
            onToggle={(next) => {
              setRadarOn(next)
              if (!next) setOpenCardSlug(null) // pins go with the radar (P-2)
            }}
          />
        )}
      </div>

      {/* Vieques Cards radar pill (S-2): left side, riding the sheet edge (L-3).
          Hidden — and its Radar paused — at the full stop or under a z-70
          overlay (L-4, W-2); unmounted with the radar. */}
      {isMobile && radarOn && (
        <Suspense fallback={null}>
          <RadarPill radar={cardRadar} hidden={snap === SHEET_FULL || addToTripFor != null} />
        </Suspense>
      )}

      {/* Scale / attribution strip. */}
      <div
        className="glass pointer-events-none absolute bottom-5 z-10 hidden items-center gap-2.5 rounded-xl px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground sm:flex"
        style={{ left: resultsOpen ? `${RESULTS_PANEL_W + 40}px` : '1.25rem' }}
      >
        © Explore Vieques · MapTiler · OpenStreetMap
      </div>

      {addToTripFor && (
        <AddToTripSheet
          place={addToTripFor}
          itineraries={itineraries}
          onClose={() => setAddToTripFor(null)}
        />
      )}
    </div>
  )
}

export default MapView
