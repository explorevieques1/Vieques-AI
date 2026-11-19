// Types for the vendored React Bits BounceCards.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC } from 'react'

export type BounceCardImage = string | { src: string; alt?: string }

export interface BounceCardsProps {
  images?: BounceCardImage[]
  className?: string
  style?: CSSProperties
  containerWidth?: number
  containerHeight?: number
  cardSize?: number
  spread?: number
  rotation?: number
  arc?: number
  animationDelay?: number
  animationStagger?: number
  bounciness?: number
  enableHover?: boolean
  pushDistance?: number
  hoverScale?: number
  borderWidth?: number
  borderColor?: string
  radius?: number
  shadow?: boolean
  /** Per-card CSS transform strings, e.g. 'rotate(5deg) translate(-150px)'. */
  transformStyles?: string[]
  onCardClick?: (index: number) => void
}

declare const BounceCards: FC<BounceCardsProps>
export default BounceCards
