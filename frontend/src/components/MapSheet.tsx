import { SHEET_HIDDEN, SHEET_SNAPS } from '../hooks/useMapInsets'
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
  /**
   * At the lowest stop the sheet stops looking like a sheet.
   *
   * It pulls in from the screen edges and rounds all four corners, so what is
   * left — the handle and the search field — reads as a floating search pill
   * over the map, the way native Maps does it. Swipe up and it re-attaches to
   * the edges and becomes the data panel again.
   *
   * Deliberately only insets and rounds: no height change. The snap value IS the
   * sheet's visible outer height, and MapView derives the camera's bottom
   * padding from it (see the max-h-[100dvh] note in ResponsivePanel), so a
   * margin-bottom here would make every camera move wrong by that much. The
   * float is horizontal + cosmetic; the vertical geometry is untouched.
   */
  const floating = snap === SHEET_HIDDEN

  return (
    <ResponsivePanel
      title={title}
      dismissible={false}
      snapPoints={SHEET_SNAPS}
      activeSnapPoint={snap}
      onSnapChange={onSnapChange}
      className={
        floating
          ? 'inset-x-3 rounded-3xl border border-white/10 shadow-2xl transition-[inset,border-radius] duration-200'
          : 'transition-[inset,border-radius] duration-200'
      }
    >
      {children}
    </ResponsivePanel>
  )
}

export default MapSheet
