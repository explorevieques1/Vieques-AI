import { lazy, Suspense, useEffect, useState } from 'react'

// The hero's contour-line terrain (React Bits <Topography>, WebGL2).
//
// It is decoration, so it must never cost the page its first paint:
//   - the ~60KB component is code-split and only fetched once the browser is
//     idle after load, so the headline paints first;
//   - it is skipped entirely without WebGL2 or when the visitor has asked to
//     save data — the CSS gradient on .hero is the fallback either way;
//   - with reduced motion it renders one still frame (speed 0, no intro).
// The wrapper fades in on .ready so the swap from fallback is not a pop.
const Topography = lazy(() => import('./reactbits/Topography.jsx'))

function canRun() {
  if (typeof window === 'undefined') return false
  if (navigator.connection?.saveData) return false
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function HeroTerrain() {
  const [show, setShow] = useState(false)
  const [ready, setReady] = useState(false)
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!canRun()) return
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 300))
    const cancel = window.cancelIdleCallback || clearTimeout
    const id = idle(() => setShow(true))
    return () => cancel(id)
  }, [])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setReady(true), 120)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null
  return (
    <div className={ready ? 'hero-terrain ready' : 'hero-terrain'} aria-hidden="true">
      <Suspense fallback={null}>
        <Topography
          color="#64DBE8"
          accent="#FF6D04"
          accentAmount={0.5}
          lineCount={26}
          lineWidth={1}
          elevation={1.1}
          tilt={38}
          speed={reduce ? 0 : 0.18}
          intro={!reduce}
          glow={0.45}
          fog={0.45}
          brightness={0.85}
          mouseInteraction={!reduce}
          hoverEffect="lift"
          clickEffect="none"
          markers="dots"
          dpr={1.5}
        />
      </Suspense>
    </div>
  )
}
