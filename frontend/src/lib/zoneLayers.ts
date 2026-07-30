import maplibregl from 'maplibre-gl'
import type { ZoneFeatureCollection } from './api'

/**
 * Proximity-zone polygons on the map — hazards, wildlife areas, recommended
 * routes — for any activity that has them.
 *
 * Started as snorkelLayers.ts with the source and layer ids hardcoded to
 * `snorkel-zones-*`. Kayaking draws exactly the same thing from an identical
 * FeatureCollection (see db/migrations/0033_kayaking.sql), so the only real
 * difference was the id strings — hence a `ns` namespace instead of a second
 * copy of the file. The ids stay distinct per namespace so a stale snorkel
 * layer can never collide with a kayak one if both are somehow mounted.
 *
 * Colour comes from the feature's own `color` property, falling back to blue,
 * so zone_type styling lives in the data rather than in a switch here.
 */
export type ZoneNamespace = 'snorkel' | 'kayak'

const ids = (ns: ZoneNamespace) => ({
  SRC: `${ns}-zones`,
  FILL: `${ns}-zones-fill`,
  LINE: `${ns}-zones-line`,
  LABEL: `${ns}-zones-label`,
})

/** Draw (or replace) the zone polygons from a GeoJSON FeatureCollection. */
export function drawZones(map: maplibregl.Map, ns: ZoneNamespace, fc: ZoneFeatureCollection) {
  const { SRC, FILL, LINE, LABEL } = ids(ns)
  removeZones(map, ns)
  if (!fc.features.length) return

  map.addSource(SRC, {
    type: 'geojson',
    data: fc as unknown as maplibregl.GeoJSONSourceSpecification['data'],
  })

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

export function removeZones(map: maplibregl.Map, ns: ZoneNamespace) {
  const { SRC, FILL, LINE, LABEL } = ids(ns)
  ;[LABEL, LINE, FILL].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(SRC)) map.removeSource(SRC)
}

/** Clear every namespace — used on category change and unmount. */
export function removeAllZones(map: maplibregl.Map) {
  ;(['snorkel', 'kayak'] as const).forEach((ns) => removeZones(map, ns))
}
