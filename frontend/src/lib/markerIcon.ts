// Builds a custom HTML marker element: a colored circle badge with an emoji.
// IMPORTANT: MapLibre positions the marker by setting `transform` on the
// element it's given. So we must NOT put our own transform (e.g. hover scale)
// on that same element, or it fights MapLibre and the pin drifts when you pan.
// Solution: outer element = MapLibre's (untouched); inner element = our styling.

export type MarkerStyle = { emoji: string; color: string }

export const ACTIVITY_ICONS: Record<string, MarkerStyle> = {
  snorkeling: { emoji: '🤿', color: '#0ea5e9' },
  diving: { emoji: '🤿', color: '#0369a1' },
  kayaking: { emoji: '🛶', color: '#14b8a6' },
  fishing: { emoji: '🎣', color: '#0891b2' },
  camping: { emoji: '⛺', color: '#65a30d' },
  sailing: { emoji: '⛵', color: '#2563eb' },
  'bio-bay': { emoji: '✨', color: '#7c3aed' },
  'horseback-riding': { emoji: '🐴', color: '#b45309' },
  'view-points': { emoji: '🔭', color: '#475569' },
  landmarks: { emoji: '🏛️', color: '#a16207' },
  'art-galleries': { emoji: '🎨', color: '#db2777' },
  sunsets: { emoji: '🌅', color: '#ea580c' },
  'wellness-yoga': { emoji: '🧘', color: '#16a34a' },
  nightlife: { emoji: '🍸', color: '#9333ea' },
  'local-markets': { emoji: '🛍️', color: '#ca8a04' },
  stargazing: { emoji: '🌌', color: '#1e3a8a' },
  adventures: { emoji: '🧭', color: '#dc2626' },
}

export const BEACH_ICON: MarkerStyle = { emoji: '🏖️', color: '#06b6d4' }

export const ESSENTIAL_ICONS: Record<string, MarkerStyle> = {
  'gas-stations': { emoji: '⛽', color: '#dc2626' },
  'convenience-stores': { emoji: '🏪', color: '#f59e0b' },
  'grocery-stores': { emoji: '🛒', color: '#16a34a' },
  pharmacies: { emoji: '💊', color: '#0ea5e9' },
  'hardware-stores': { emoji: '🔧', color: '#78716c' },
  'banks-atms': { emoji: '🏧', color: '#15803d' },
  'post-office': { emoji: '📮', color: '#2563eb' },
  laundry: { emoji: '🧺', color: '#7c3aed' },
}

export const SERVICE_ICONS: Record<string, MarkerStyle> = {
  emergency: { emoji: '🚑', color: '#dc2626' },
  physicians: { emoji: '🩺', color: '#0ea5e9' },
  dental: { emoji: '🦷', color: '#06b6d4' },
  municipal: { emoji: '🏛️', color: '#a16207' },
  'pool-maintenance': { emoji: '🏊', color: '#0891b2' },
  towing: { emoji: '🚛', color: '#b45309' },
  mechanic: { emoji: '🔧', color: '#78716c' },
  solar: { emoji: '☀️', color: '#f59e0b' },
  'real-estate': { emoji: '🏠', color: '#16a34a' },
  exterminator: { emoji: '🐜', color: '#7c2d12' },
  veterinarian: { emoji: '🐾', color: '#9333ea' },
  babysitting: { emoji: '👶', color: '#db2777' },
  housekeeping: { emoji: '🧹', color: '#0d9488' },
  accountant: { emoji: '🧮', color: '#475569' },
  attorney: { emoji: '⚖️', color: '#1e3a8a' },
  catering: { emoji: '🍽️', color: '#ea580c' },
  photography: { emoji: '📷', color: '#6d28d9' },
}

// Fallback used when a slug has no specific icon.
export const DEFAULT_ICON: MarkerStyle = { emoji: '📍', color: '#a855f7' }

export function makeMarkerEl({ emoji, color }: MarkerStyle): HTMLDivElement {
  // Outer wrapper — MapLibre owns its transform; we don't touch it.
  const outer = document.createElement('div')
  outer.style.cssText = 'width:32px;height:32px;cursor:pointer;'

  // Inner badge — all visual styling + hover scale lives here.
  const inner = document.createElement('div')
  inner.style.cssText = `
    width:32px;height:32px;box-sizing:border-box;
    display:flex;align-items:center;justify-content:center;
    background:${color};
    border:2px solid white;
    border-radius:50%;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);
    font-size:16px;line-height:1;
    transition:transform 0.1s;
  `
  inner.textContent = emoji
  outer.onmouseenter = () => (inner.style.transform = 'scale(1.15)')
  outer.onmouseleave = () => (inner.style.transform = 'scale(1)')

  outer.appendChild(inner)
  return outer
}