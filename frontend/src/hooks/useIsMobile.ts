import { useEffect, useState } from "react"

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
