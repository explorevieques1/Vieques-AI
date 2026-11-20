import { useEffect, useState } from 'react'

/**
 * How many px of the layout viewport's bottom the on-screen keyboard covers
 * (docs/CARD_UI_SPEC.md S-8 "keyboard-safe (`visualViewport`)").
 *
 * iOS Safari doesn't shrink the layout viewport when the keyboard opens, so a
 * `position: fixed; bottom: 0` sheet stays put and the keyboard draws over its
 * input. The visual viewport does shrink (and scrolls by `offsetTop` when iOS
 * pans a focused field into view); the gap between its bottom edge and the
 * layout viewport's is the keyboard. A bottom sheet adds this to its bottom
 * offset and rides on top of the keyboard.
 *
 * 0 where there's no visualViewport (old browsers) or no keyboard (desktop).
 * Only listens while `enabled`.
 */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!enabled || !vv) return
    const update = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop)
      // Sub-pixel noise and the iOS toolbar collapsing aren't a keyboard.
      setInset(covered > 40 ? Math.round(covered) : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [enabled])

  return inset
}
