// Types for the vendored React Bits DepthCarousel.jsx (tsconfig has no allowJs —
// same arrangement as GlassSurface.d.ts).
import type { FC } from 'react'

export type DepthCarouselItem = string | { image: string; alt?: string }

export interface DepthCarouselProps {
  items?: DepthCarouselItem[]
  cardWidth?: number
  cardHeight?: number
  radius?: number
  tint?: string
  depth?: number
  spread?: number
  tilt?: number
  tiltDirection?: 'left' | 'right'
  perspective?: number
  visibleCards?: number
  falloff?: number
  blur?: number
  duration?: number
  ease?: string
  autoplay?: boolean
  autoplayDelay?: number
  loop?: boolean
  showControls?: boolean
  showIndicators?: boolean
  onChange?: (index: number, item: { image: string; alt?: string }) => void
  className?: string
}

declare const DepthCarousel: FC<DepthCarouselProps>
export default DepthCarousel
