import { useEffect, type RefObject } from 'react'

/**
 * Let a text field OUTSIDE the map sheet keep focus.
 *
 * The map sheet is a vaul Drawer with `modal={false}`, but vaul 1.1.2 never
 * forwards `modal` to Radix's Dialog.Root (node_modules/vaul: Root gets only
 * `open`/`defaultOpen`). So the sheet is still a *modal* dialog, and Radix's
 * FocusScope listens for `focusin`/`focusout` on `document` and bounces any
 * focus that lands outside the sheet straight back inside it. On an iPhone
 * that reads as "I tap the field, the keyboard flashes up and closes, I can't
 * type" — the nearby banner's on-site answer and the riddle sheet both sit
 * outside the sheet (fixed overlays), so both were untypeable.
 *
 * Fix (same as the old MapTopBar quick-search guard, see MapTopBar.tsx): a
 * capture-phase listener on `document` that stops focus events whose target
 * (or relatedTarget) is inside `ref`, so they never reach Radix's bubble
 * listener. Focus moving between other elements is untouched.
 */
export function useOutsideSheetFocus(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const guard = (e: FocusEvent) => {
      const el = ref.current
      if (!el) return
      const inside = (n: EventTarget | null) => n instanceof Node && el.contains(n)
      if (inside(e.target) || inside(e.relatedTarget)) e.stopPropagation()
    }
    document.addEventListener('focusin', guard, true)
    document.addEventListener('focusout', guard, true)
    return () => {
      document.removeEventListener('focusin', guard, true)
      document.removeEventListener('focusout', guard, true)
    }
  }, [ref, enabled])
}
