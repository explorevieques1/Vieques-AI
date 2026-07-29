/**
 * Distance helpers.
 *
 * `milesBetween` used to live inside MapView, which was fine while the results
 * list was the only thing that wanted a distance label. Saved places want the
 * same label without loading a category, so it moved here rather than being
 * imported out of a component.
 */

/** Great-circle distance in miles between two [lng, lat] pairs. */
export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** "3.2mi" / "480ft" — under a tenth of a mile, feet reads better than "0.1mi". */
export function formatMiles(mi: number): string {
  if (mi < 0.1) return `${Math.round(mi * 5280)}ft`
  return `${mi.toFixed(1)}mi`
}
