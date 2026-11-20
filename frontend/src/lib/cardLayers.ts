import maplibregl from 'maplibre-gl'

import { RARITY, type Rarity } from './rarity'

/**
 * Vieques Cards collect ring (docs/CARD_UI_SPEC.md S-3, P-4).
 *
 * One GeoJSON source + two layers: a faint rarity-coloured fill (8 %) and a
 * dashed rim at the card's collect radius. Drawn for ONE card only — the
 * revealed, collectable card you're standing within reveal range of.
 *
 * Trails pattern (lib/trailLayers.ts), not zones: the caller re-draws when
 * `styleId` changes, because setStyle drops every source and layer we added
 * (MapView re-adds it on `styledata` once the new style has loaded).
 */

const SRC = 'cards-ring'
const FILL = 'cards-ring-fill'
const LINE = 'cards-ring-line'

/**
 * The ring shows for the nearest revealed card within this distance — the
 * reveal range the banner promises ("within 200 m", S-4). The server keeps
 * each card's own reveal radius; this is only when to draw the target.
 */
export const CARD_RING_RANGE_M = 200

/** The radar's reach (backend RADAR_RANGE_M): a pin this close counts as "on the map" in the pill. */
export const CARD_RADAR_RANGE_M = 1000

const METRES_PER_DEG_LAT = 111_320
const STEPS = 64

export type CardRing = {
  /** [lng, lat] of a revealed or owned card (P-5: never a hidden one). */
  center: [number, number]
  radiusM: number
  rarity: Rarity
}

// Spelled out rather than the global `GeoJSON.*` namespace — see trailLayers.ts.
type RingSourceData = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, never>
    geometry: { type: 'Polygon'; coordinates: [number, number][][] }
  }>
}

/** A circle of `radiusM` metres as a polygon (flat-earth offset; fine at < 1 km). */
function circle([lng, lat]: [number, number], radiusM: number): [number, number][] {
  const dLat = radiusM / METRES_PER_DEG_LAT
  const dLng = radiusM / (METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return ring
}

/**
 * The rarity token (T-1) as `rgb(…)`. MapLibre paint can't read CSS custom
 * properties, and its parser doesn't take oklch — so resolve the token off the
 * document and let a 1px canvas convert it (same trick as lib/cardFace.ts).
 */
function rarityRgb(rarity: Rarity): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(RARITY[rarity].cssVar).trim()
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx || !value) return 'transparent' // no canvas: skip the ring rather than guess a colour
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}

export function drawCardRing(map: maplibregl.Map, ring: CardRing) {
  const data: RingSourceData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [circle(ring.center, ring.radiusM)] },
      },
    ],
  }
  const color = rarityRgb(ring.rarity)

  const existing = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
  if (existing) {
    existing.setData(data)
    map.setPaintProperty(FILL, 'fill-color', color)
    map.setPaintProperty(LINE, 'line-color', color)
    return
  }

  map.addSource(SRC, { type: 'geojson', data })
  map.addLayer({
    id: FILL,
    type: 'fill',
    source: SRC,
    paint: { 'fill-color': color, 'fill-opacity': 0.08 },
  })
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': 1.5,
      'line-opacity': 0.9,
      'line-dasharray': ['literal', [2, 2]],
    },
  })
}

/** True while the ring's source is in the current style (setStyle drops it). */
export function hasCardRing(map: maplibregl.Map): boolean {
  return !!map.getSource(SRC)
}

export function removeCardRing(map: maplibregl.Map) {
  ;[LINE, FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(SRC)) map.removeSource(SRC)
}
