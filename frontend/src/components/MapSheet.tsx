import { SHEET_SNAPS } from '../hooks/useMapInsets'
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
  return (
    <ResponsivePanel
      title={title}
      dismissible={false}
      snapPoints={SHEET_SNAPS}
      activeSnapPoint={snap}
      onSnapChange={onSnapChange}
    >
      {children}
    </ResponsivePanel>
  )
}

export default MapSheet
