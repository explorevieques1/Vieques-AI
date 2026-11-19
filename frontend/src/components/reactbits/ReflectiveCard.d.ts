// Types for the vendored React Bits ReflectiveCard.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface ReflectiveCardProps {
  name?: ReactNode
  role?: ReactNode
  badge?: ReactNode
  status?: ReactNode
  statusColor?: string
  idLabel?: ReactNode
  idValue?: ReactNode
  children?: ReactNode
  theme?: 'dark' | 'light'
  videoSrc?: string
  webcam?: boolean
  onWebcamError?: (error: unknown) => void
  tint?: string
  metalness?: number
  roughness?: number
  blurStrength?: number
  grayscale?: number
  warp?: number
  warpScale?: number
  shine?: number
  bevel?: number
  glare?: number
  enableTilt?: boolean
  tiltStrength?: number
  intro?: boolean
  width?: number
  height?: number
  radius?: number
  className?: string
  style?: CSSProperties
}

declare const ReflectiveCard: FC<ReflectiveCardProps>
export default ReflectiveCard
