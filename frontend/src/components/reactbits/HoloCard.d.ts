// Types for the vendored React Bits HoloCard.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC } from 'react'

export type HoloCardPreset =
  | 'bursts' | 'stars' | 'shards' | 'cosmos' | 'rainbow' | 'swirl' | 'glitter' | 'gold'

export interface HoloCardProps {
  image: string
  backImage?: string
  alt?: string
  preset?: HoloCardPreset
  intensity?: number
  scale?: number
  edgeSparkle?: number
  frame?: number
  glare?: number
  foilColor?: string
  width?: number
  radius?: number
  tiltMax?: number
  hoverScale?: number
  idle?: boolean
  shadow?: boolean
  className?: string
  style?: CSSProperties
}

declare const HoloCard: FC<HoloCardProps>
export default HoloCard
