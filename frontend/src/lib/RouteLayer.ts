import maplibregl from 'maplibre-gl'
import type { DirectionsResult } from './api'

const SRC = 'route-line'
const CASING = 'route-line-casing'
const LINE = 'route-line-main'

// Draw a highlighted route plus start/end markers; fit the map to it.
export function drawRoute(
  map: maplibregl.Map,
  result: DirectionsResult,
  markers: maplibregl.Marker[],
) {
  removeRoute(map, markers)

  map.addSource(SRC, {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: result.geometry } as unknown as maplibregl.GeoJSONSourceSpecification['data'],
  })

  // dark casing underneath for contrast
  map.addLayer({
    id: CASING,
    type: 'line',
    source: SRC,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0c4a6e', 'line-width': 8 },
  })
  // bright highlighted route on top
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#22d3ee', 'line-width': 5 },
  })

  // start (green) + end (red) markers
  markers.push(
    new maplibregl.Marker({ color: '#22c55e', anchor: 'center' })
      .setLngLat([result.from.longitude, result.from.latitude])
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`<b>Start:</b> ${result.from.name}`))
      .addTo(map),
  )
  markers.push(
    new maplibregl.Marker({ color: '#ef4444', anchor: 'center' })
      .setLngLat([result.to.longitude, result.to.latitude])
      .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`<b>Destination:</b> ${result.to.name}`))
      .addTo(map),
  )

  const b = new maplibregl.LngLatBounds()
  result.geometry.coordinates.forEach((c) => b.extend(c as [number, number]))
  if (!b.isEmpty()) map.fitBounds(b, { padding: 80, maxZoom: 15 })
}

export function removeRoute(map: maplibregl.Map, markers: maplibregl.Marker[]) {
  ;[LINE, CASING].forEach((id) => map.getLayer(id) && map.removeLayer(id))
  if (map.getSource(SRC)) map.removeSource(SRC)
  markers.forEach((m) => m.remove())
  markers.length = 0
}