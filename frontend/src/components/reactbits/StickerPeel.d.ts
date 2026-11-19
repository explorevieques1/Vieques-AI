// Types for the vendored React Bits StickerPeel.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { FC, HTMLAttributes } from 'react'

export interface StickerPeelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd'> {
  imageSrc: string
  width?: number
  rotate?: number
  peelDirection?: number
  peelBackHoverPct?: number
  peelBackActivePct?: number
  curlRadius?: number
  finish?: 'gloss' | 'matte' | 'holo'
  backColor?: string
  lightingIntensity?: number
  shadowIntensity?: number
  followPointer?: boolean
  draggable?: boolean
  swing?: number
  friction?: number
  bounce?: number
  intro?: boolean
  /** 'center', or a px offset from the centre. */
  initialPosition?: 'center' | { x?: number; y?: number }
  onDragStart?: () => void
  onDragEnd?: () => void
  dpr?: number
}

declare const StickerPeel: FC<StickerPeelProps>
export default StickerPeel
