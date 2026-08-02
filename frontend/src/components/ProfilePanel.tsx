// ============================================================================
//  ProfilePanel — desktop shell for the profile view
// ============================================================================
//
//  The map app has no router (App.tsx drives everything off local state), so
//  this is an overlay panel rather than a route — same idiom as AiChatPane and
//  DirectionsPanel.
//
//  Mobile does not use this: the profile renders as the map sheet's content
//  (see MapView's `sheetBody`), reached from the bottom nav. All the actual
//  content lives in ProfileBody so the two share one tree.
// ============================================================================

import { useEffect } from 'react'

import ProfileBody from './ProfileBody'

type Props = { onClose: () => void }

export default function ProfilePanel({ onClose }: Props) {
  // Close on Escape, like the other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Click-off backdrop.
          `z-30` here was a tie with MapTopBar's banner row, which is also z-30
          and is painted EARLIER (App renders ProfilePanel after MapView), so
          the scrim won the tiebreak and buried the category pills — the app's
          only way to load a result set. Closing the panel restored them, but
          the pills were unreachable for as long as it was open, and the same
          tie made them un-clickable through the backdrop. z-35 keeps the
          scrim above the map and its panels (z-20) while staying below the
          chrome the user has to be able to reach. */}
      <div
        className="absolute inset-0 z-35 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Your profile"
        className="glass absolute bottom-5 right-5 top-[5.5rem] z-40 flex w-[400px] flex-col
                   overflow-hidden rounded-3xl shadow-2xl"
      >
        <ProfileBody onClose={onClose} />
      </aside>
    </>
  )
}
