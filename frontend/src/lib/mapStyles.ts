/** MapTiler basemaps offered in the layer switcher. */
export type MapStyleOption = { label: string; id: string }

export const MAP_STYLES: MapStyleOption[] = [
  { label: 'Satellite', id: 'hybrid' },
  { label: 'Streets', id: 'streets-v2' },
  { label: 'Outdoor', id: 'outdoor-v2' },
  { label: 'Basic', id: 'basic-v2' },
]

export const DEFAULT_MAP_STYLE = 'streets-v2'

const KEY = import.meta.env.VITE_MAPTILER_KEY

export const styleUrl = (id: string) =>
  `https://api.maptiler.com/maps/${id}/style.json?key=${KEY}`
