// Types for the vendored React Bits GlassSurface.jsx. The map app's tsconfig
// does not allowJs, so this file is what TypeScript resolves the import to,
// while Vite serves the .jsx beside it.
import type { CSSProperties, FC, ReactNode, RefObject } from 'react'

type Channel = 'R' | 'G' | 'B'

export interface GlassSurfaceProps {
  children?: ReactNode
  width?: number | string
  height?: number | string
  borderRadius?: number
  shape?: string
  refraction?: boolean
  renderer?: 'auto' | 'svg' | 'webgl'
  backdrop?: RefObject<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>
  distortionScale?: number
  borderWidth?: number
  blur?: number
  brightness?: number
  opacity?: number
  displace?: number
  redOffset?: number
  greenOffset?: number
  blueOffset?: number
  backgroundOpacity?: number
  saturation?: number
  xChannel?: Channel
  yChannel?: Channel
  mixBlendMode?: CSSProperties['mixBlendMode']
  className?: string
  style?: CSSProperties
}

declare const GlassSurface: FC<GlassSurfaceProps>
export default GlassSurface
