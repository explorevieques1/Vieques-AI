// Types for the vendored React Bits Counter.jsx. The map app's tsconfig does not
// allowJs, so TypeScript resolves the import to this file while Vite serves the
// .jsx beside it. Hand-written from the upstream prop defaults (2026-11-19).
import type { CSSProperties, FC, ReactNode } from 'react'

export interface CounterProps {
  value?: number
  locale?: string
  format?: Intl.NumberFormatOptions
  decimals?: number
  minDigits?: number
  prefix?: ReactNode
  suffix?: ReactNode
  direction?: 'auto' | 'up' | 'down' | 'shortest'
  duration?: number
  bounce?: number
  stagger?: number
  motionBlur?: boolean
  intro?: boolean
  fade?: number
  fontSize?: number
  fontWeight?: CSSProperties['fontWeight']
  textColor?: string
  gap?: number
  padding?: number
  tabular?: boolean
  digitStyle?: CSSProperties
  className?: string
  style?: CSSProperties
}

declare const Counter: FC<CounterProps>
export default Counter
