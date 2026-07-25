import * as React from "react"

import { useIsMobile } from "@/hooks/useIsMobile"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

type Props = {
  /** Which edge the panel docks to on desktop. Ignored on mobile. */
  side?: "left" | "right"
  /** Accessible title for the mobile drawer (also satisfies vaul's a11y req). */
  title: string
  /** Desktop width utility, e.g. "sm:w-96". */
  desktopWidth?: string
  /** Called when the user dismisses (× button, overlay tap, or drag-down). */
  onClose: () => void
  className?: string
  children: React.ReactNode
}

/**
 * One panel shell, two presentations from a single child tree:
 *  - phone (<=640px): a bottom Drawer that slides up over the map (map stays
 *    visible behind), with a drag handle and safe-area padding.
 *  - desktop: the original fixed edge `<aside>`.
 *
 * Children supply their own header + scrollable body — identical in both modes,
 * so we never duplicate a panel's contents into a separate mobile layout.
 */
export function ResponsivePanel({
  side = "left",
  title,
  desktopWidth = "sm:w-80",
  onClose,
  className,
  children,
}: Props) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer
        open
        modal={false}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        {/* Non-modal + no overlay: the map stays visible and interactive behind
            the sheet (pins you just loaded remain tappable), like a native map
            app. Dismiss via the × in the header or by dragging the sheet down. */}
        <DrawerContent className={className} showOverlay={false}>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
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
