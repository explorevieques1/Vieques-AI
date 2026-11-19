// Types for the vendored React Bits ShinyText.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface ShinyTextProps {
  text?: string
  children?: ReactNode
  color?: string
  shineColor?: string
  speed?: number
  delay?: number
  angle?: number
  shineWidth?: number
  softness?: number
  bands?: number
  glow?: number
  direction?: 'left' | 'right'
  easing?: 'linear' | 'smooth' | 'snappy'
  trigger?: 'loop' | 'hover' | 'view'
  yoyo?: boolean
  followPointer?: boolean
  pauseOnHover?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

declare const ShinyText: FC<ShinyTextProps>
export default ShinyText
