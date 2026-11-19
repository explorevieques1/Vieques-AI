// Types for the vendored React Bits PixelCard.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface PixelCardProps {
  variant?: 'default' | 'blue' | 'yellow' | 'pink'
  /** Array or comma-separated list of colours. */
  colors?: string | string[]
  gap?: number
  speed?: number
  pixelSize?: number
  shape?: 'square' | 'circle' | 'diamond'
  origin?: 'center' | 'pointer'
  revealDuration?: number
  spotlight?: number
  glow?: number
  glowColor?: string
  opacity?: number
  fade?: number
  trigger?: 'hover' | 'click' | 'always'
  clickPulse?: boolean
  intro?: boolean
  introDelay?: number
  noFocus?: boolean
  theme?: 'dark' | 'light'
  radius?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

declare const PixelCard: FC<PixelCardProps>
export default PixelCard
