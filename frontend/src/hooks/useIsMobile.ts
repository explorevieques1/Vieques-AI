import { useEffect, useState, useSyncExternalStore } from "react"

// Single source of truth for "phone-sized". Matches Tailwind's `sm` breakpoint
// (640px) so JS behavior (Drawer vs fixed sidebar) lines up with the CSS
// `max-sm:` / `sm:` layout rules. This is a *behavior* switch, not a device
// check — we never sniff the user agent for "iPhone".
const MOBILE_QUERY = "(max-width: 640px)"

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}

// Vieques Cards (CARD_UI_SPEC S-10, owner 2026-11-20): whether this device can
// collect is decided by touch, not width. A coarse primary pointer (phones,
// iPads in either orientation) gets the full Hold-to-collect flow wherever the
// banner sits; a fine pointer (laptops, desktops) gets "Cards are collected on
// your phone, on the island." Layout stays width-based (useIsMobile).
const COARSE_POINTER_QUERY = "(pointer: coarse)"

function subscribeCoarsePointer(onChange: () => void): () => void {
  const mql = window.matchMedia(COARSE_POINTER_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function readCoarsePointer(): boolean {
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}

export function useCanCollect(): boolean {
  // Server snapshot false: no collecting until a real pointer says so.
  return useSyncExternalStore(subscribeCoarsePointer, readCoarsePointer, () => false)
}
