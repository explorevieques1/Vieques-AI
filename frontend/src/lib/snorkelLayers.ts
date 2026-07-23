import maplibregl from 'maplibre-gl'
import type { ZoneFeatureCollection } from './api'

const SRC = 'snorkel-zones'
const FILL = 'snorkel-zones-fill'
const LINE = 'snorkel-zones-line'
const LABEL = 'snorkel-zones-label'

// Draw (or replace) the zone polygons on the map from a GeoJSON FeatureCollection.
export function drawSnorkelZones(map: maplibregl.Map, fc: ZoneFeatureCollection) {
  removeSnorkelZones(map)
  if (!fc.features.length) return

  map.addSource(SRC, { type: 'geojson', data: fc as unknown as maplibregl.GeoJSONSourceSpecification['data'] })

  // shaded fill, colored per-feature
  map.addLayer({
    id: FILL,
    type: 'fill',
    source: SRC,
    paint: {
      'fill-color': ['coalesce', ['get', 'color'], '#3b82f6'],
      'fill-opacity': 0.25,
    },
  })

  // outline
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#3b82f6'],
      'line-width': 2.5,
    },
  })

  // labels at polygon centers
  map.addLayer({
    id: LABEL,
    type: 'symbol',
    source: SRC,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 13,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  })

  // fit to the zones
  const b = new maplibregl.LngLatBounds()
  fc.features.forEach((f) =>
    f.geometry.coordinates[0].forEach((c) => b.extend(c as [number, number])),
  )
  if (!b.isEmpty()) map.fitBounds(b, { padding: 120, maxZoom: 16 })
}

export function removeSnorkelZones(map: maplibregl.Map) {
  ;[LABEL, LINE, FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(SRC)) map.removeSource(SRC)
}