import maplibregl from 'maplibre-gl'

import type { Place } from './place'

// The dashed-red treatment specified in data/docs/hiking.md §"Rendering in
// MapLibre". Kept in one constant because markerIcon.ts's TRAIL_ICON matches
// it — the trailhead pin and its line must read as the same object, so if this
// changes, change that too.
export const TRAIL_LINE_COLOR = '#e01e37'

// Spelled out rather than using the global `GeoJSON.*` namespace: @types/geojson
// is not a dependency of this app, and only maplibre pulls it in transitively —
// relying on that makes the build break whenever maplibre reshuffles its deps.
type TrailSourceData = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: { id: string; name: string; selected: boolean }
    geometry: { type: 'LineString'; coordinates: [number, number][] }
  }>
}

const SRC = 'trails'
const CASING = 'trails-line-casing'
const LINE = 'trails-line'
const LABEL = 'trails-label'

/**
 * Draw every trail as one GeoJSON source + line layers.
 *
 * One source for all trails, not one per trail: MapLibre re-renders the whole
 * style when sources are added or removed, so N sources means N style rebuilds
 * every time the list changes. Selection is expressed as a data-driven paint
 * expression over a `selected` feature property instead — changing it is a
 * `setData` call, no layer churn.
 *
 * Three layers, bottom to top:
 *   casing — a wider dark stroke, so a thin red line stays legible over both
 *            the light and satellite basemaps
 *   line   — the dashed trail itself
 *   label  — the trail name following the line, which is how you tell two
 *            trails apart without clicking either
 */
export function drawTrails(map: maplibregl.Map, trails: Place[], selectedId: string | null) {
  const data: TrailSourceData = {
    type: 'FeatureCollection',
    features: trails
      .filter((t) => t.geometry)
      .map((t) => ({
        type: 'Feature',
        properties: {
          id: t.id,
          name: t.name,
          selected: t.id === selectedId,
        },
        geometry: t.geometry!,
      })),
  }

  const existing = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
  if (existing) {
    // The layers are already in the style — just swap the data. This is the
    // path taken on every selection change.
    existing.setData(data)
    return
  }

  map.addSource(SRC, { type: 'geojson', data })

  map.addLayer({
    id: CASING,
    type: 'line',
    source: SRC,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': 'rgba(0,0,0,0.45)',
      'line-width': ['case', ['get', 'selected'], 9, 6],
    },
  })

  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': TRAIL_LINE_COLOR,
      'line-width': ['case', ['get', 'selected'], 5, 3],
      'line-opacity': ['case', ['get', 'selected'], 1, 0.85],
      // Dash units are multiples of line-width, so the pattern has to scale
      // with it or the selected line's dashes look tighter, not just thicker.
      'line-dasharray': ['case', ['get', 'selected'], ['literal', [1.2, 0.6]], ['literal', [2, 1]]],
    },
  })

  map.addLayer({
    id: LABEL,
    type: 'symbol',
    source: SRC,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-size': 12,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-offset': [0, 1],
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  })
}

export function removeTrails(map: maplibregl.Map) {
  ;[LABEL, LINE, CASING].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(SRC)) map.removeSource(SRC)
}

/** Layer ids that should respond to a click, so MapView can wire selection. */
export const TRAIL_CLICK_LAYERS = [LINE, CASING]
