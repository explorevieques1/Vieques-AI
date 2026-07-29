import { useEffect, useState } from 'react'

/**
 * The notch / home-indicator insets as *numbers*.
 *
 * `pad-safe-top` and friends already hand these to CSS, which is enough for
 * anything laid out in the document. The map is not: MapLibre's camera padding
 * is a plain pixel box computed in JS (see useMapInsets), and it has no way to
 * see an `env()` value. Before this hook the mobile top inset was the hardcoded
 * `TOP_BAR_H_MOBILE = 100`, which silently ignored the 47pt notch — so on a
 * notched iPhone every pin sat ~47px lower in the visible band than intended.
 *
 * Read off custom properties rather than a magic number per device: `env()` is
 * only legal in a CSS value position, so `--sat: env(safe-area-inset-top)` in
 * index.css is the bridge. Returns zeros where unsupported, which is the
 * correct answer for a desktop browser.
 */
export type SafeArea = { top: number; bottom: number }

function read(): SafeArea {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 }
  const s = getComputedStyle(document.documentElement)
  const px = (name: string) => parseFloat(s.getPropertyValue(name)) || 0
  return { top: px('--sat'), bottom: px('--sab') }
}

export function useSafeArea(): SafeArea {
  const [area, setArea] = useState<SafeArea>(read)

  useEffect(() => {
    // Orientation changes swap which edges are inset, and iOS reports the new
    // values a tick after the event — hence the deferred re-read.
    const sync = () => requestAnimationFrame(() => setArea(read()))
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  return area
}
