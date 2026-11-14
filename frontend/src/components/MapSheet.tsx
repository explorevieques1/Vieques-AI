import { useEffect } from 'react'

import { SHEET_FULL, SHEET_HIDDEN, SHEET_PREVIEW, SHEET_SNAPS } from '../hooks/useMapInsets'
import { ResponsivePanel } from './ui/ResponsivePanel'

type Props = {
  title: string
  snap: string | number | null
  onSnapChange: (snap: string | number | null) => void
  children: React.ReactNode
}

/**
 * The mobile map sheet — the app's single display surface.
 *
 * Everything the phone layout shows lives in here: the search bar, the results
 * list, a selected place's detail, the AI chat, saved places and the profile.
 * The bottom nav swaps the contents; the sheet itself is always mounted.
 *
 * Three rest heights (see SHEET_SNAPS): the search bar alone, about a third of
 * the screen, and full. Dragging between them feeds `sheetHeight` into
 * useMapInsets, and every camera move pads by it — that is the whole "the sheet
 * never covers the pin" behaviour, with no separate re-centring code path.
 *
 * `dismissible={false}` is what makes the lowest stop a floor rather than a
 * trapdoor. It is not a nicety: the sheet now hosts the search bar and the nav
 * modes, so there is nothing left for "dismissed" to mean — and before it, a
 * hard swipe down threw away the category the user had picked.
 */
function MapSheet({ title, snap, onSnapChange, children }: Props) {
  useSheetMotion(snap)

  return (
    <ResponsivePanel
      title={title}
      dismissible={false}
      snapPoints={SHEET_SNAPS}
      activeSnapPoint={snap}
      onSnapChange={onSnapChange}
      className="vq-map-sheet border-x border-t border-white/10"
    >
      {children}
    </ResponsivePanel>
  )
}

/**
 * Follow the sheet with the finger, Apple Maps style.
 *
 * vaul moves the sheet with a transform and tells us nothing until it lands on
 * a stop, so anything keyed to `snap` alone jumps. Instead this reads where the
 * sheet actually IS (its top edge) every frame while it is moving, and
 * publishes two 0..1 values on <html> for CSS to use:
 *
 *   --sheet-low   0 at the lowest stop → 1 once it has risen NAV_FADE_PX.
 *                 Fades the bottom nav out as the sheet leaves the floor —
 *                 so tapping a pin (sheet glides to the middle stop) fades the
 *                 nav with the glide, and dragging back down fades it in.
 *   --sheet-full  0 at the middle stop → 1 at full. Drives the side gap and
 *                 corner radius in index.css: a floating card at the low and
 *                 middle stops that meets the screen edges as it reaches full.
 *
 * Written straight to CSS variables, not React state: this changes every
 * frame of a drag, and re-rendering the map and the results list at 60fps
 * would be the stutter this is meant to remove.
 *
 * It only runs while something moves: a touch on the sheet, or a snap change
 * from code (tapping a pin), starts a rAF loop that stops itself once the
 * position has held still for ~20 frames — i.e. after vaul's settle animation.
 */
const NAV_FADE_PX = 90

function useSheetMotion(snap: string | number | null) {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    let still = 0
    let lastY = Number.NaN

    const publish = (el: HTMLElement) => {
      const y = el.getBoundingClientRect().top
      if (y === lastY) return false
      lastY = y
      const h = window.innerHeight
      const lowTop = h - parseFloat(SHEET_HIDDEN)
      const midTop = h - SHEET_PREVIEW * h
      const fullTop = h - SHEET_FULL * h
      const low = Math.min(1, Math.max(0, (lowTop - y) / NAV_FADE_PX))
      const full = Math.min(1, Math.max(0, (midTop - y) / (midTop - fullTop)))
      root.style.setProperty('--sheet-low', low.toFixed(3))
      root.style.setProperty('--sheet-full', full.toFixed(3))
      // Past halfway faded, the nav stops taking taps and drops out of the
      // tab order (see .vq-bottom-nav in index.css).
      root.toggleAttribute('data-nav-hidden', low > 0.5)
      return true
    }

    const tick = () => {
      const el = document.querySelector<HTMLElement>('.vq-map-sheet')
      if (!el) {
        frame = 0
        return
      }
      still = publish(el) ? 0 : still + 1
      frame = still < 20 ? requestAnimationFrame(tick) : 0
    }
    const kick = () => {
      still = 0
      if (!frame) frame = requestAnimationFrame(tick)
    }

    kick() // the snap just changed (or first mount): follow the glide
    const onDown = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.vq-map-sheet')) kick()
    }
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true })
    document.addEventListener('touchstart', onDown, { capture: true, passive: true })
    window.addEventListener('resize', kick)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onDown, { capture: true })
      document.removeEventListener('touchstart', onDown, { capture: true })
      window.removeEventListener('resize', kick)
    }
  }, [snap])

  // Leaving the phone layout unmounts the sheet: put the nav back.
  useEffect(
    () => () => {
      const root = document.documentElement
      root.style.removeProperty('--sheet-low')
      root.style.removeProperty('--sheet-full')
      root.removeAttribute('data-nav-hidden')
    },
    [],
  )
}

export default MapSheet
