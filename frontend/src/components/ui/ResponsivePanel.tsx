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
  onClose: () => void
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

  if (isMobile) {
    return (
      <Drawer
        open
        modal={false}
        {...snapProps}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        {/* Non-modal + no overlay: the map stays visible and interactive behind
            the sheet (pins you just loaded remain tappable), like a native map
            app. Dismiss via the × in the header or by dragging the sheet down. */}
        {/* In snap mode vaul drives the sheet's offset itself and expects a
            tall content box to slide; the default `h-auto max-h-[85dvh]`
            would fight it. */}
        <DrawerContent
          className={cn(snapPoints && "h-full max-h-[94dvh]", className)}
          showOverlay={false}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
