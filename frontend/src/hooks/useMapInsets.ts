import { useMemo } from 'react'

import { useIsMobile } from './useIsMobile'

/**
 * How much of the map is hidden behind floating chrome, in CSS pixels.
 *
 * This is the mechanic behind "the pin sits centred between the two panels"
 * and "the bottom card never covers the pin". MapLibre's flyTo / easeTo /
 * fitBounds all accept a `padding` box that shifts the *optical* centre, so
 * the correct fix is to tell the map what's covered — not to fudge the
 * latitude by a magic offset.
 *
 * Feed the result into every camera move. When the insets change (a panel
 * opens, the mobile sheet snaps to a new height) re-run the last camera move
 * with the new padding and the selection slides back into view.
 */
export type MapInsets = { top: number; right: number; bottom: number; left: number }

/** Widths must match the panel classes in MapView — see RESULTS_W / DETAIL_W there. */
export const RESULTS_PANEL_W = 344
export const DETAIL_PANEL_W = 400
/** Gutter between a floating panel and the viewport edge (Tailwind `left-5`). */
export const PANEL_GAP = 20
/**
 * Height of the floating top bar plus its gutter.
 *
 * Phones carry a second row for the category pills but a tighter gutter and
 * smaller pills; desktop is the single control row. Both are measured from
 * MapTopBar's classes — keep them in step if that padding changes.
 */
export const TOP_BAR_H = 88
export const TOP_BAR_H_MOBILE = 100

/**
 * Mobile sheet rest heights. Fractions are of the viewport; the collapsed stop
 * is a fixed pixel height because what it must show is a fixed thing — the drag
 * handle and the search field, nothing else.
 *
 * Collapsed exists so swiping the sheet down gets it out of the way *without*
 * throwing away the category: before, the only thing below peek was dismissal,
 * so "let me see the map" cost you your results. Peek keeps a selected pin on
 * screen above the sheet; full is for reading.
 *
 * They live here because they are what the bottom inset resolves to.
 */
// Generous because a snap height is the sheet's *outer* height, and the sheet
// pads itself by env(safe-area-inset-bottom) — on a home-indicator iPhone ~34px
// of this is padding, not content. It has to still clear the handle, the
// tap-to-expand strip and the search field after that is taken out.
export const SHEET_COLLAPSED = '148px'
export const SHEET_PEEK = 0.45
export const SHEET_FULL = 0.92
export const SHEET_SNAPS: (string | number)[] = [SHEET_COLLAPSED, SHEET_PEEK, SHEET_FULL]

type Args = {
  /** Desktop: is the left results panel showing? */
  resultsOpen: boolean
  /** Desktop: is the right detail panel showing? */
  detailOpen: boolean
  /** Mobile: current height of the bottom sheet in px (0 when closed). */
  sheetHeight: number
}

export function useMapInsets({ resultsOpen, detailOpen, sheetHeight }: Args): MapInsets {
  const isMobile = useIsMobile()

  return useMemo(() => {
    if (isMobile) {
      // Phones stack: chrome on top, sheet on the bottom, nothing at the sides.
      // Cap the sheet inset — once the sheet passes ~60% of the screen there is
      // no usable map left, and over-padding makes MapLibre clamp oddly.
      const maxBottom = Math.max(0, window.innerHeight * 0.55)
      return {
        top: TOP_BAR_H_MOBILE,
        right: 16,
        bottom: Math.min(sheetHeight, maxBottom),
        left: 16,
      }
    }

    return {
      top: TOP_BAR_H,
      right: detailOpen ? DETAIL_PANEL_W + PANEL_GAP * 2 : PANEL_GAP,
      bottom: PANEL_GAP,
      left: resultsOpen ? RESULTS_PANEL_W + PANEL_GAP * 2 : PANEL_GAP,
    }
  }, [isMobile, resultsOpen, detailOpen, sheetHeight])
}

/**
 * MapLibre throws if padding exceeds the canvas. Clamp before every camera
 * move — narrow windows and a wide detail panel can otherwise collide.
 */
export function safeInsets(insets: MapInsets, width: number, height: number): MapInsets {
  const hRoom = Math.max(0, width - 40)
  const vRoom = Math.max(0, height - 40)
  const hScale = insets.left + insets.right > hRoom ? hRoom / (insets.left + insets.right) : 1
  const vScale = insets.top + insets.bottom > vRoom ? vRoom / (insets.top + insets.bottom) : 1
  return {
    left: Math.floor(insets.left * hScale),
    right: Math.floor(insets.right * hScale),
    top: Math.floor(insets.top * vScale),
    bottom: Math.floor(insets.bottom * vScale),
  }
}
