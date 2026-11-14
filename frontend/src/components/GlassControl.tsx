import type { ReactNode } from 'react'

import { LIQUID_GLASS } from '../lib/glass'
import GlassSurface from './reactbits/GlassSurface'

/**
 * Map controls sit straight on bright map tiles, not on a dark panel like the
 * nav and the category strip, so 35% tint read as pale and see-through there.
 * 65% makes them the same dark material as the rest of the chrome while the
 * rim and edge refraction stay visible.
 */
const CONTROL_GLASS = { ...LIQUID_GLASS, backgroundOpacity: 0.65 }

/**
 * Round map controls on the same liquid glass as the bottom nav and the top
 * bento, so every floating control on the map shares one material: the glass
 * rim, the dark tint, the same pill/circle geometry (radius = half the height).
 *
 * The <button> fills the glass rather than the glass being the button: the
 * glass carries an SVG filter and its own layers, and keeping it a plain box
 * means focus rings, hover and aria all stay on a real button.
 */
export function GlassButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <GlassSurface
      {...CONTROL_GLASS}
      width={48}
      height={48}
      borderRadius={24}
      className="vq-glass vq-glass--flush vq-glass--control pointer-events-auto"
    >
      <button
        onClick={onClick}
        aria-label={label}
        title={label}
        className="grid h-full w-full place-items-center rounded-full text-foreground transition-colors hover:bg-white/8 active:bg-white/12"
      >
        {children}
      </button>
    </GlassSurface>
  )
}

/** A vertical capsule of stacked controls (zoom in / out). */
export function GlassStack({ height, children }: { height: number; children: ReactNode }) {
  return (
    <GlassSurface
      {...CONTROL_GLASS}
      width={48}
      height={height}
      borderRadius={24}
      className="vq-glass vq-glass--tight vq-glass--control pointer-events-auto"
    >
      <div className="flex h-full w-full flex-col items-center">{children}</div>
    </GlassSurface>
  )
}
