// Types for the vendored React Bits ElectricBorder.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface ElectricBorderProps {
  children?: ReactNode
  color?: string
  glowColor?: string
  speed?: number
  chaos?: number
  spread?: number
  thickness?: number
  strands?: number
  glow?: number
  intensity?: number
  arcs?: number
  flicker?: number
  borderRadius?: number
  offset?: number
  active?: boolean
  intro?: boolean
  interactive?: boolean
  cursorRadius?: number
  theme?: 'dark' | 'light'
  className?: string
  style?: CSSProperties
}

declare const ElectricBorder: FC<ElectricBorderProps>
export default ElectricBorder
