import { ChevronDown } from 'lucide-react'
import { useEffect } from 'react'

import { SHEET_FULL, SHEET_HIDDEN, SHEET_PREVIEW, SHEET_SNAPS } from '../hooks/useMapInsets'
import { ResponsivePanel } from './ui/ResponsivePanel'

type Props = {
  title: string
  snap: string | number | null
  onSnapChange: (snap: string | number | null) => void
  /**
   * Shows a ⌄ button in the handle row whenever the sheet is above its lowest
   * stop. The bottom nav hides once the sheet leaves the floor, so a pane
   * with no collapse control of its own (Ask AI, Saved, Profile, Menu) would
   * leave a drag as the only way back — and a drag only moves one stop. Explore
   * passes nothing: its results header and place detail have their own ⌄.
   */
  onCollapse?: () => void
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
function MapSheet({ title, snap, onSnapChange, onCollapse, children }: Props) {
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
      {onCollapse && snap !== SHEET_HIDDEN && (
        // Absolute against the sheet itself (the drawer is `fixed`), so it sits
        // in the 22px handle row above every body's own header.
        <button
          onClick={onCollapse}
          aria-label="Collapse"
          title="Collapse"
          className="absolute right-3 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/8 text-muted-foreground transition-colors hover:bg-white/14 hover:text-foreground"
        >
          <ChevronDown size={16} />
        </button>
      )}
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

/**
 * Where the sheet's top actually rests at the lowest stop, measured — not
 * computed. Module-level so it survives the effect re-running on every snap.
 *
 * Why measured: the pixel maths below derives the lowest stop from
 * `window.innerHeight`, and on iPhone Safari that number changes as the
 * toolbar collapses/expands while vaul keeps the sheet where it put it. The
 * two drifted ~46px apart after a few minutes of use — past the halfway fade —
 * and the nav vanished with the sheet at rest at its lowest stop (2026-11-14).
 */
let lowRestTop: number | null = null

function useSheetMotion(snap: string | number | null) {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    let still = 0
    let lastY = Number.NaN
    // A finger on the sheet. While it is down the loop never stops on its own:
    // stopping after ~20 still frames used to end tracking during a mid-drag
    // pause, and a drag that then ended back at the SAME stop changed no
    // `snap` to restart it — the nav stayed hidden at the lowest stop.
    let held = false

    const publish = (el: HTMLElement) => {
      const y = el.getBoundingClientRect().top
      if (y === lastY) return false
      lastY = y
      const h = window.innerHeight
      const lowTop = lowRestTop ?? h - parseFloat(SHEET_HIDDEN)
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

    /**
     * The sheet has stopped: the nav's state comes from the stop vaul says it
     * is at, never from pixels. Measurement only drives the fade WHILE the sheet
     * moves; at rest, "lowest stop ⇒ nav shown" holds whatever the viewport did.
     */
    const settle = (el: HTMLElement) => {
      if (snap === SHEET_HIDDEN) {
        lowRestTop = el.getBoundingClientRect().top
        root.style.setProperty('--sheet-low', '0')
        root.removeAttribute('data-nav-hidden')
      } else if (snap != null) {
        root.style.setProperty('--sheet-low', '1')
        root.setAttribute('data-nav-hidden', '')
      }
    }

    const tick = () => {
      const el = document.querySelector<HTMLElement>('.vq-map-sheet')
      if (!el) {
        frame = 0
        return
      }
      still = publish(el) ? 0 : still + 1
      if (held || still < 20) {
        frame = requestAnimationFrame(tick)
      } else {
        frame = 0
        settle(el)
      }
    }
    const kick = () => {
      still = 0
      if (!frame) frame = requestAnimationFrame(tick)
    }

    kick() // the snap just changed (or first mount): follow the glide
    const onDown = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.vq-map-sheet')) {
        held = true
        kick()
      }
    }
    // Release (or the OS stealing the gesture): follow vaul's settle animation
    // from here, then let the loop stop once the sheet is still.
    const onUp = () => {
      if (!held) return
      held = false
      kick()
    }
    const opts = { capture: true, passive: true } as const
    const up = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const
    document.addEventListener('pointerdown', onDown, opts)
    document.addEventListener('touchstart', onDown, opts)
    up.forEach((t) => document.addEventListener(t, onUp, opts))
    // A viewport change re-measures the resting spot from scratch. iOS reports
    // toolbar collapse/expand on visualViewport, not always on window.
    const onViewport = () => {
      lowRestTop = null
      kick()
    }
    window.addEventListener('resize', onViewport)
    window.visualViewport?.addEventListener('resize', onViewport)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onDown, opts)
      document.removeEventListener('touchstart', onDown, opts)
      up.forEach((t) => document.removeEventListener(t, onUp, opts))
      window.removeEventListener('resize', onViewport)
      window.visualViewport?.removeEventListener('resize', onViewport)
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
