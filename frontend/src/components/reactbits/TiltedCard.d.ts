// Types for the vendored React Bits TiltedCard.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, MouseEvent, ReactNode } from 'react'

export interface TiltedCardProps {
  imageSrc?: string
  altText?: string
  captionText?: string
  containerHeight?: number | string
  containerWidth?: number | string
  imageHeight?: number | string
  imageWidth?: number | string
  scaleOnHover?: number
  rotateAmplitude?: number
  showTooltip?: boolean
  overlayContent?: ReactNode
  displayOverlayContent?: boolean
  overlayDepth?: number
  children?: ReactNode
  backContent?: ReactNode
  flipOnClick?: boolean
  flipped?: boolean
  onFlip?: (flipped: boolean) => void
  radius?: number
  perspective?: number
  smoothness?: number
  glare?: number
  glareColor?: string
  shadow?: number
  parallax?: number
  axis?: 'both' | 'horizontal' | 'vertical'
  reverse?: boolean
  trackWindow?: boolean
  floating?: boolean
  gyroscope?: boolean
  intro?: boolean
  introDelay?: number
  onClick?: (event: MouseEvent<HTMLElement>) => void
  className?: string
  style?: CSSProperties
}

export interface TiltedCardLayerProps {
  depth?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export declare const TiltedCardLayer: FC<TiltedCardLayerProps>
declare const TiltedCard: FC<TiltedCardProps>
export default TiltedCard
