import * as React from "react"

import { useIsMobile } from "@/hooks/useIsMobile"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

type Props = {
  /** Which edge the panel docks to on desktop. Ignored on mobile. */
  side?: "left" | "right"
  /**
   * Desktop presentation.
   *  - `edge`     — full-height aside flush to the viewport edge (chat,
   *                 directions, profile). The original behaviour.
   *  - `floating` — inset, rounded, frosted card hovering over the map, per the
   *                 redesign mockups. Used by the results and detail panels.
   */
  variant?: "edge" | "floating"
  /** Accessible title for the mobile drawer (also satisfies vaul's a11y req). */
  title: string
  /** Desktop width utility, e.g. "sm:w-96". */
  desktopWidth?: string
  /** Called when the user dismisses (× button, overlay tap, or drag-down). */
  onClose?: () => void
  /**
   * Mobile: may the sheet be dragged away entirely?
   *
   * `false` makes the lowest snap point a floor — vaul ignores a downward drag
   * once it is the active one. That is what turns "swipe down" into "get out of
   * my way" rather than "throw away my category", and it is why the permanent
   * mobile sheet can host the search bar at its lowest stop.
   */
  dismissible?: boolean
  /**
   * Mobile snap heights, e.g. [0.35, 0.9]. When given, the sheet rests at
   * discrete heights and can be swiped between them instead of being simply
   * open or closed.
   */
  snapPoints?: (string | number)[]
  activeSnapPoint?: string | number | null
  onSnapChange?: (snap: string | number | null) => void
  className?: string
  children: React.ReactNode
}

/**
 * One panel shell, two presentations from a single child tree:
 *  - phone (<=640px): a bottom Drawer that slides up over the map (map stays
 *    visible behind), with a drag handle and safe-area padding.
 *  - desktop: an `<aside>`, either edge-docked or floating over the map.
 *
 * Children supply their own header + scrollable body — identical in both modes,
 * so we never duplicate a panel's contents into a separate mobile layout.
 */
export function ResponsivePanel({
  side = "left",
  variant = "edge",
  title,
  desktopWidth = "sm:w-80",
  onClose,
  dismissible = true,
  snapPoints,
  activeSnapPoint,
  onSnapChange,
  className,
  children,
}: Props) {
  const isMobile = useIsMobile()

  // Only hand vaul the snap trio when snapping is actually wanted — passing
  // `snapPoints={undefined}` alongside a setter puts it in a half-configured
  // state where the sheet reports NaN heights.
  const snapProps = snapPoints
    ? { snapPoints, activeSnapPoint, setActiveSnapPoint: onSnapChange }
    : {}

  /**
   * The active snap as a CSS length, used to clip the content to what is
   * actually on screen.
   *
   * This is the other half of the `max-h-[100dvh]` note below, and without it
   * that fix is only half a fix. vaul anchors the sheet to `bottom-0` and slides
   * it DOWN by `innerHeight - snapValue`, so the element's bottom edge always
   * ends up at `innerHeight + offset` — below the fold by exactly the amount it
   * was pushed. The element has to be full-height for a snap value to mean the
   * visible height, but that leaves its lower portion off screen, and a
   * `flex-1` scroller inside will happily size itself to the whole element.
   *
   * Measured at 390x844: at the 0.45 snap the results scroller ran from y=666 to
   * y=1307 — 463px past the bottom of the phone. The list scrolled, but its last
   * rows sat below the physical screen and could not be reached or tapped.
   *
   * Capping the content to the snap height puts the scroller's own bottom edge
   * exactly on the fold, so "scrolled to the end" means what it says.
   * `- 22px` is the drag handle above it (mt-3 + h-1.5 + mb-1 in ui/drawer).
   */
  const snapCss =
    typeof activeSnapPoint === 'number'
      ? `${activeSnapPoint * 100}dvh`
      : typeof activeSnapPoint === 'string'
        ? activeSnapPoint
        : null

  if (isMobile) {
    return (
      <Drawer
        open
        modal={false}
        dismissible={dismissible}
        {...snapProps}
        onOpenChange={(open) => {
          if (!open) onClose?.()
        }}
      >
        {/* Non-modal + no overlay: the map stays visible and interactive behind
            the sheet (pins you just loaded remain tappable), like a native map
            app. Dismiss via the × in the header or by dragging the sheet down. */}
        {/* In snap mode vaul drives the sheet's offset itself and expects a
            tall content box to slide; the default `h-auto max-h-[85dvh]`
            would fight it.

            `max-h-[100dvh]` is load-bearing and must stay exactly that. vaul
            translates the sheet by `innerHeight - snapValue` (useSnapPoints in
            node_modules/vaul), so the visible height is
            `elementHeight + snapValue - innerHeight`. Any cap below 100dvh
            makes every snap render short by the difference — at `94dvh` on an
            844px screen that was ~51px, and because `sheetHeight` in MapView is
            derived from the nominal snap, the map's bottom padding was wrong by
            the same amount on every camera move. At 100dvh the snap value *is*
            the visible outer height, 1:1. The rounded top corners still show
            because SHEET_FULL is < 1. */}
        <DrawerContent
          className={cn(snapPoints && "h-full max-h-[100dvh]", className)}
          showOverlay={false}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          {/* `flex-1` is dropped when the height is set, not merely overridden:
              `flex: 1 1 0%` resolves the main size from flex-basis and ignores
              `height` outright, so leaving it on silently reverted the clip. */}
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden',
              !(snapPoints && snapCss) && 'flex-1',
            )}
            style={snapPoints && snapCss ? { height: `calc(${snapCss} - 22px)` } : undefined}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (variant === "floating") {
    return (
      <aside
        className={cn(
          // Sits below the floating top bar with an even gutter all round.
          "absolute top-[5.75rem] bottom-5 z-20 flex w-full flex-col overflow-hidden",
          "glass rounded-3xl shadow-2xl",
          side === "left" ? "left-5" : "right-5",
          desktopWidth,
          className,
        )}
      >
        {children}
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        "absolute top-0 z-20 h-full w-full flex flex-col bg-card/95 backdrop-blur shadow-2xl",
        side === "left"
          ? "left-0 border-r border-border"
          : "right-0 border-l border-border",
        desktopWidth,
        className,
      )}
    >
      {children}
    </aside>
  )
}
