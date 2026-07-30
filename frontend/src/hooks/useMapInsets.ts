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

/**
 * Mobile chrome, measured piece by piece rather than as one number.
 *
 * The phone layout stacks independent things above the map — the greeting card,
 * the category row, the ☰ row, and whichever of those is currently hidden — so a
 * single TOP_BAR_H_MOBILE constant could only ever be right for one
 * combination. Minimising the greeting card genuinely gives the map 60px back,
 * and the camera should know.
 *
 * There is no banner term any more: the phone has no top bar. The greeting card
 * is flush to the safe-area top and the ☰ trigger sits *below* the category row,
 * so the menu is now a term at the bottom of the stack rather than 52px at the
 * top of it.
 *
 * Budget at 390x844 with the greeting expanded:
 *   47 notch + 100 greeting + 6 + 40 categories + 6 + 36 menu = 235
 *   441 map band
 *   168 sheet at its lowest stop (the bottom nav overlays its lowest 90)
 * Keep these in step with the actual classes in MapTopBar / GreetingCard /
 * CategoryRow — they are measurements of those components, not free parameters.
 */
export const GREETING_H = 100
export const GREETING_H_MIN = 40
export const CATEGORY_ROW_H = 40
/** The ☰ row below the categories: a 36px (h-9) trigger, always on screen. */
export const MENU_ROW_H = 36
export const CHROME_GAP = 6
/** Inner height of the bottom nav, excluding its safe-area padding. */
export const BOTTOM_NAV_H = 56

/**
 * Total mobile top inset, for whatever chrome is currently on screen.
 *
 * `safeTop` comes from useSafeArea rather than being baked in: env() is only
 * legal in CSS, so before that hook existed this number silently ignored the
 * notch and every pin sat ~47px low in the visible band.
 */
export function mobileTopInset({
  safeTop,
  greeting,
  categories,
}: {
  safeTop: number
  greeting: 'expanded' | 'minimized' | 'hidden'
  categories: boolean
}): number {
  let h = safeTop
  if (greeting !== 'hidden') {
    h += greeting === 'expanded' ? GREETING_H : GREETING_H_MIN
  }
  if (categories) h += CHROME_GAP + CATEGORY_ROW_H
  // The ☰ row is the one piece that is on screen in every mode.
  h += CHROME_GAP + MENU_ROW_H
  return h
}

/** Kept for the desktop-only callers that still want one number. */
export const TOP_BAR_H_MOBILE = 236

/**
 * The three mobile sheet stops, per §5 of the mobile rebuild:
 *
 *   HIDDEN  — the search bar and nothing else. The map is the screen.
 *   PREVIEW — about a third of the screen; a selected pin still fits above it.
 *   FULL    — to the top of the screen, for reading and for the chat.
 *
 * A snap value is the sheet's visible outer height, exactly — but only because
 * ui/ResponsivePanel caps the drawer at `max-h-[100dvh]`. vaul translates a
 * full-height box by `innerHeight - snapValue`, so any smaller cap makes every
 * stop render short by the difference (it was `94dvh`, i.e. ~51px short at
 * 844px, and `sheetHeight` fed that error straight into the camera padding).
 * If that class changes, these numbers stop meaning what they say.
 *
 * HIDDEN is a pixel height because what it must show is a fixed thing — the
 * handle and the search field. The other two are viewport fractions because
 * "a third of the screen" is the actual intent.
 *
 * There is no dismissal below HIDDEN: the sheet is passed `dismissible={false}`,
 * so a downward drag at the lowest stop is ignored rather than throwing away the
 * category. Before that, "let me see the map" cost you your results.
 */
export const SHEET_HIDDEN = '168px'
export const SHEET_PREVIEW = 0.45
export const SHEET_FULL = 0.93
export const SHEET_SNAPS: (string | number)[] = [SHEET_HIDDEN, SHEET_PREVIEW, SHEET_FULL]

type Args = {
  /** Desktop: is the left results panel showing? */
  resultsOpen: boolean
  /** Desktop: is the right detail panel showing? */
  detailOpen: boolean
  /** Mobile: current height of the bottom sheet in px (0 when closed). */
  sheetHeight: number
  /** Mobile: total height of the chrome above the map — see mobileTopInset. */
  topInset?: number
  /** Mobile: the home-indicator inset, so the nav's real height is known. */
  safeBottom?: number
}

export function useMapInsets({
  resultsOpen,
  detailOpen,
  sheetHeight,
  topInset,
  safeBottom = 0,
}: Args): MapInsets {
  const isMobile = useIsMobile()

  return useMemo(() => {
    if (isMobile) {
      // Phones stack: chrome on top, sheet on the bottom, nothing at the sides.
      // Cap the sheet inset — once the sheet passes ~60% of the screen there is
      // no usable map left, and over-padding makes MapLibre clamp oddly.
      const maxBottom = Math.max(0, window.innerHeight * 0.55)
      // Floored at the bottom nav: the nav sits over the sheet's lowest 90px,
      // so even at the smallest snap that strip of map is not really visible.
      // Without the floor the camera would happily centre a pin behind it.
      const navH = BOTTOM_NAV_H + safeBottom
      return {
        top: topInset ?? TOP_BAR_H_MOBILE,
        right: 16,
        bottom: Math.min(Math.max(sheetHeight, navH), maxBottom),
        left: 16,
      }
    }

    return {
      top: TOP_BAR_H,
      right: detailOpen ? DETAIL_PANEL_W + PANEL_GAP * 2 : PANEL_GAP,
      bottom: PANEL_GAP,
      left: resultsOpen ? RESULTS_PANEL_W + PANEL_GAP * 2 : PANEL_GAP,
    }
  }, [isMobile, resultsOpen, detailOpen, sheetHeight, topInset, safeBottom])
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
