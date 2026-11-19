// Types for the vendored React Bits HoldButton.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { FC, ReactNode } from 'react'

export interface HoldButtonProps {
  children?: ReactNode
  doneLabel?: ReactNode
  icon?: ReactNode
  doneIcon?: ReactNode
  backgroundColor?: string
  fillColor?: string
  textColor?: string
  fillTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  fillDirection?: 'right' | 'up'
  /** ms the press must be held. */
  holdTime?: number
  releaseTime?: number
  pressScale?: number
  wave?: boolean
  waveAmplitude?: number
  glow?: boolean
  resetAfter?: number
  disabled?: boolean
  onHold?: () => void
  onTap?: () => void
  className?: string
}

declare const HoldButton: FC<HoldButtonProps>
export default HoldButton
