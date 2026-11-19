// Types for the vendored React Bits SplitFlapText.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, HTMLAttributes } from 'react'

export interface SplitFlapTextProps extends HTMLAttributes<HTMLDivElement> {
  words?: string[]
  text?: string
  flipDuration?: number
  stagger?: number
  cycleDelay?: number
  charset?: 'alpha' | 'alphanumeric' | 'numeric'
  flipsPerChar?: number
  tileColor?: string
  textColor?: string
  tileRadius?: number
  gap?: number
  fontSize?: number
  loop?: boolean
  padTo?: number
  align?: 'left' | 'center' | 'right'
  intro?: boolean
  glare?: number
  depth?: number
  order?: 'left' | 'right' | 'center' | 'random'
  tileStyle?: 'board' | 'minimal'
  style?: CSSProperties
}

declare const SplitFlapText: FC<SplitFlapTextProps>
export default SplitFlapText
