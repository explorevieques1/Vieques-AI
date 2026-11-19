// Types for the vendored React Bits ClickSpark.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'

export interface ClickSparkHandle {
  /** Fire a burst at (x, y), in px relative to the spark layer. */
  spark: (x?: number, y?: number) => void
}

export interface ClickSparkProps {
  sparkColor?: string | string[]
  sparkSize?: number
  sparkRadius?: number
  sparkCount?: number
  sparkWidth?: number
  duration?: number
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'
  extraScale?: number
  shape?: 'line' | 'streak' | 'dot' | 'star'
  randomness?: number
  gravity?: number
  spread?: number
  direction?: number
  glow?: number
  ring?: boolean
  layer?: 'front' | 'back'
  disabled?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

declare const ClickSpark: ForwardRefExoticComponent<ClickSparkProps & RefAttributes<ClickSparkHandle>>
export default ClickSpark
