// Types for the vendored React Bits GlareHover.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface GlareHoverProps {
  width?: number | string
  height?: number | string
  background?: string
  borderRadius?: string
  borderColor?: string
  children?: ReactNode
  glareColor?: string
  glareOpacity?: number
  glareAngle?: number
  glareSize?: number
  softness?: number
  variant?: 'streak' | 'twin' | 'sheen'
  blendMode?: CSSProperties['mixBlendMode']
  rimGlint?: boolean
  mode?: 'hover' | 'follow' | 'click' | 'loop'
  transitionDuration?: number
  /** Seconds between sweeps in 'loop' mode. */
  interval?: number
  playOnce?: boolean
  intro?: boolean
  className?: string
  style?: CSSProperties
}

declare const GlareHover: FC<GlareHoverProps>
export default GlareHover
