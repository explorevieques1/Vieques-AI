import { useEffect, useRef } from 'react'

/** Marks the one history entry the Cards overlays push. */
const KEY = 'vqCardsOverlay'

function ours(state: unknown): boolean {
  return typeof state === 'object' && state != null && (state as Record<string, unknown>)[KEY] === true
}

/**
 * The system back gesture / browser Back closes a full-screen overlay instead
 * of leaving the app (docs/CARD_UI_SPEC.md S-7 "Close: ✕, swipe down, back").
 *
 * While `open`, one history entry is pushed. Back pops it → `onBack()`. Closing
 * any other way (✕, swipe, Escape) drops that entry again with `history.back()`,
 * so a later Back isn't swallowed by a dead entry.
 *
 * One entry is shared by every Cards overlay that `open` covers: card detail
 * handing over to the riddle sheet keeps it, so Back still closes the riddle.
 * The drop is deferred a tick, which keeps StrictMode's mount → unmount →
 * mount in development from popping the entry it just pushed.
 */
export function useBackToClose(open: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack)
  const openRef = useRef(open)
  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    openRef.current = open
    if (!open) return
    if (!ours(window.history.state)) {
      const base = typeof window.history.state === 'object' ? window.history.state : null
      window.history.pushState({ ...base, [KEY]: true }, '')
    }
    const onPop = () => {
      if (!ours(window.history.state)) onBackRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.setTimeout(() => {
        if (!openRef.current && ours(window.history.state)) window.history.back()
      }, 0)
    }
  }, [open])
}
