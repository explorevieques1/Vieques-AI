// Types for the vendored React Bits Carousel.jsx (tsconfig has no allowJs —
// same arrangement as GlassSurface.d.ts).
import type { CSSProperties, FC, ReactNode } from 'react'

export type CarouselItem =
  | string
  | ReactNode
  | { id?: string | number; image?: string; alt?: string; icon?: ReactNode; title?: string; description?: string }

export interface CarouselProps {
  items?: CarouselItem[]
  baseWidth?: number | string
  aspectRatio?: number
  peek?: number
  gap?: number
  radius?: number
  frame?: boolean
  effect?: 'tilt' | 'slide' | 'scale' | 'fade' | 'cube'
  indicator?: 'dots' | 'bars' | 'counter' | 'none'
  arrows?: boolean
  autoplay?: boolean
  autoplayDelay?: number
  pauseOnHover?: boolean
  loop?: boolean
  draggable?: boolean
  round?: boolean
  initialIndex?: number
  theme?: 'dark' | 'light'
  onChange?: (index: number) => void
  className?: string
  style?: CSSProperties
}

declare const Carousel: FC<CarouselProps>
export default Carousel
