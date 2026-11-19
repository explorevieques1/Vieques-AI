// Types for the vendored React Bits Radar.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { FC, HTMLAttributes } from 'react'

export interface RadarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'color'> {
  color?: string
  backgroundColor?: string
  mode?: 'sweep' | 'pulse'
  speed?: number
  trail?: number
  scale?: number
  ringCount?: number
  spokeCount?: number
  ticks?: boolean
  targets?: number
  clutter?: number
  glow?: number
  brightness?: number
  gridOpacity?: number
  lineWidth?: number
  tilt?: number
  centerX?: number
  centerY?: number
  mouseInteraction?: boolean
  intro?: boolean
  grain?: number
  fade?: number
  opacity?: number
  lightMode?: boolean
  paused?: boolean
  dpr?: number
  className?: string
}

declare const Radar: FC<RadarProps>
export default Radar
