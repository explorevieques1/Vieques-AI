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
  // Trails come from the `trails` table and get TRAIL_ICON via trailToPlace, so
  // this entry is only reached if a guided-hike *listing* is ever filed under
  // the hiking subcategory. Matching TRAIL_ICON keeps the two from clashing on
  // the same chip; without it such a listing would fall back to 'adventures'.
  hiking: { emoji: '🥾', color: '#e01e37' },
}

export const BEACH_ICON: MarkerStyle = { emoji: '🏖️', color: '#06b6d4' }

export const STAY_ICON: MarkerStyle = { emoji: '🏨', color: '#8b5cf6' }

// Trailheads. The colour is deliberately shared with TRAIL_LINE_COLOR in
// lib/trailLayers.ts so the pin and the line it belongs to read as one object.
export const TRAIL_ICON: MarkerStyle = { emoji: '🥾', color: '#e01e37' }

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

/** iOS-style "you are here": a solid blue dot under a slow expanding halo. */
export const USER_DOT_COLOR = '#1a73e8'

/**
 * Builds the live-location dot.
 *
 * Same three-node discipline as makeMarkerEl: MapLibre writes translate() to
 * the outer element, so the halo's scale animation has to live on a child.
 * `pointer-events:none` throughout — the dot is a readout, not a target, and
 * must never swallow a tap meant for a place pin underneath it.
 */
export function makeUserDotEl(): HTMLDivElement {
  const outer = document.createElement('div')
  outer.style.cssText = 'width:18px;height:18px;pointer-events:none;'

  const halo = document.createElement('div')
  halo.style.cssText = `
    position:absolute;inset:0;border-radius:50%;
    background:${USER_DOT_COLOR};pointer-events:none;
    animation:user-dot-pulse 2.4s ease-out infinite;
  `
  outer.appendChild(halo)

  const dot = document.createElement('div')
  dot.style.cssText = `
    position:relative;width:18px;height:18px;box-sizing:border-box;
    background:${USER_DOT_COLOR};border:3px solid white;border-radius:50%;
    box-shadow:0 0 0 1px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.45);
  `
  outer.appendChild(dot)

  return outer
}

export function makeMarkerEl(
  { emoji, color }: MarkerStyle,
  /** Selected pins get the larger teal badge + pulse ring from the mockups. */
  selected = false,
  /**
   * `suggestion` marks the Suggestion of the Day: a squared badge with a
   * permanent pulse, so it reads as "this one is different" among a screen of
   * round category pins even when it is not the selected one.
   */
  variant: 'default' | 'suggestion' = 'default',
): HTMLDivElement {
  const suggestion = variant === 'suggestion'
  const size = selected ? 44 : suggestion ? 38 : 32
  const radius = suggestion ? '14px' : '50%'

  // Outer wrapper — MapLibre owns its transform; we don't touch it.
  //
  // Do NOT set `position` here. MapLibre's `.maplibregl-marker` class applies
  // `position: absolute`, and an inline `position: relative` outranks it — the
  // marker then sits in normal flow while MapLibre keeps writing translate()
  // to it, so pins visibly drift away from their coordinates as you zoom.
  // The ring below still anchors correctly, because this element is absolutely
  // positioned by that class and is therefore already a containing block.
  const outer = document.createElement('div')
  outer.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;`

  if (selected || suggestion) {
    // Expanding ring behind the badge. Its own element, because the badge
    // needs a separate (hover) transform and MapLibre already claimed the
    // outer one — three nodes, three independent transforms.
    const ring = document.createElement('div')
    // A suggestion that is merely *offered* gets a slower, fainter ring than a
    // pin the user actually picked — it should catch the eye without competing
    // with the selection. `${color}80` rather than a lower keyframe opacity
    // because the animation drives opacity itself and would override it.
    const idle = suggestion && !selected
    ring.style.cssText = `
      position:absolute;inset:-6px;border-radius:${radius};
      background:${idle ? `${color}80` : color};pointer-events:none;
      animation:marker-pulse ${idle ? '2.8s' : '2s'} ease-out infinite;
    `
    outer.appendChild(ring)
  }

  // Inner badge — all visual styling + hover scale lives here.
  const inner = document.createElement('div')
  inner.style.cssText = `
    position:relative;
    width:${size}px;height:${size}px;box-sizing:border-box;
    display:flex;align-items:center;justify-content:center;
    background:${color};
    border:2px solid ${selected ? 'rgba(255,255,255,0.9)' : 'white'};
    border-radius:${radius};
    box-shadow:${
      selected
        ? `0 8px 24px ${color}80, 0 2px 6px rgba(0,0,0,0.5)`
        : '0 1px 4px rgba(0,0,0,0.4)'
    };
    font-size:${selected ? 22 : 16}px;line-height:1;
    transition:transform 0.1s;
  `
  inner.textContent = emoji
  outer.onmouseenter = () => (inner.style.transform = 'scale(1.15)')
  outer.onmouseleave = () => (inner.style.transform = 'scale(1)')

  outer.appendChild(inner)
  return outer
}