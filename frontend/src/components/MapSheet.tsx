import { SHEET_SNAPS } from '../hooks/useMapInsets'
import { ResponsivePanel } from './ui/ResponsivePanel'

type Props = {
  title: string
  snap: string | number | null
  onSnapChange: (snap: string | number | null) => void
  onClose: () => void
  children: React.ReactNode
}

/**
 * The mobile map sheet: results and detail live inside one draggable surface
 * with two rest heights.
 *
 * Peek shows the scrollable results (or a selected place's headline); swipe up
 * for the full record; swipe back down and MapView re-centres the pin, because
 * the sheet's live height feeds useMapInsets and every camera move pads by it.
 * That is the whole "the card never covers the pin" behaviour — there is no
 * separate re-centring code path.
 */
function MapSheet({ title, snap, onSnapChange, onClose, children }: Props) {
  return (
    <ResponsivePanel
      title={title}
      onClose={onClose}
      snapPoints={SHEET_SNAPS}
      activeSnapPoint={snap}
      onSnapChange={onSnapChange}
    >
      {children}
    </ResponsivePanel>
  )
}

export default MapSheet
