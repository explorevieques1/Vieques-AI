import { useEffect, useRef } from 'react'

// Hero iPhone, built in CSS 3D (no three.js, no model file).
//
//   scene   — perspective + pointer tilt (CSS vars --tx/--ty set below)
//   enter   — one-time swing-in on load
//   sway    — slow idle rotation
//   body    — the phone: ~20 stacked edge layers give it real thickness,
//             the front layer is the bezel + screen
//
// The screen is a live DOM layer, not a texture: the map is a pre-downscaled
// screenshot (srcset), and the Ask AI demo on top is HTML sized in container
// units (cqw), so it stays crisp at every angle and size.
//
// The demo is a pure-CSS 12s loop (see .p3d-* keyframes in styles.css). It is
// paused while the phone is offscreen, and reduced motion gets a still phone
// showing the finished conversation.

const EDGE_LAYERS = 20

export default function Phone3D() {
  const sceneRef = useRef(null)

  // Pointer tilt (mouse/trackpad only) + pause the loop when offscreen.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return undefined

    const io = new IntersectionObserver(([e]) => {
      scene.dataset.playing = e.isIntersecting ? 'true' : 'false'
    })
    io.observe(scene)

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduce) return () => io.disconnect()

    let raf = 0
    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const tick = () => {
      cur.x += (target.x - cur.x) * 0.08
      cur.y += (target.y - cur.y) * 0.08
      scene.style.setProperty('--tx', `${cur.x.toFixed(2)}deg`)
      scene.style.setProperty('--ty', `${cur.y.toFixed(2)}deg`)
      scene.style.setProperty('--gx', `${(50 + cur.x * 4).toFixed(1)}%`)
      if (Math.abs(target.x - cur.x) > 0.01 || Math.abs(target.y - cur.y) > 0.01) raf = requestAnimationFrame(tick)
      else raf = 0
    }
    const onMove = (e) => {
      // Normalise to -1..1 across the viewport; max ±9° of extra tilt.
      target.x = ((e.clientX / window.innerWidth) * 2 - 1) * 9
      target.y = -((e.clientY / window.innerHeight) * 2 - 1) * 6
      if (!raf) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="p3d-scene" ref={sceneRef} data-playing="true">
      <div className="p3d-shadow" aria-hidden="true" />
      <div className="p3d-enter">
        <div className="p3d-sway">
          <div className="p3d-body">
            {/* Edge: back-to-front stack. Deeper layers are darker. */}
            {Array.from({ length: EDGE_LAYERS }, (_, i) => (
              <div
                key={i}
                className="p3d-edge"
                aria-hidden="true"
                style={{
                  transform: `translateZ(${-(EDGE_LAYERS - i) * 1.3}px)`,
                  filter: `brightness(${0.55 + (i / EDGE_LAYERS) * 0.5})`,
                }}
              >
                {i === Math.floor(EDGE_LAYERS / 2) && (
                  <>
                    <span className="p3d-btn p3d-btn-action" />
                    <span className="p3d-btn p3d-btn-vol1" />
                    <span className="p3d-btn p3d-btn-vol2" />
                    <span className="p3d-btn p3d-btn-power" />
                  </>
                )}
              </div>
            ))}

            <div className="p3d-front">
              <div className="p3d-screen">
                <AppDemo />
                <div className="p3d-island" aria-hidden="true" />
                <div className="p3d-glare" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

// What plays on the screen: the real map screenshot, with the Ask AI sheet,
// conversation and highlighted pins drawn over it in HTML.
function AppDemo() {
  return (
    <div className="p3d-app">
      <div className="p3d-map">
        <img
          src="/app-screenshot-720.jpg"
          srcSet="/app-screenshot-720.jpg 720w, /app-screenshot-1080.jpg 1080w, /app-screenshot.jpg 1170w"
          sizes="(min-width: 940px) 340px, 300px"
          width={1170}
          height={2532}
          alt="Explore Vieques map on iPhone with beach pins across Vieques island"
          fetchpriority="high"
          decoding="async"
        />
      </div>

      {/* Clip ends at the tab bar (89% down the screenshot) so the sheet
          slides up from behind it, like the real app's bottom sheet. */}
      <div className="p3d-sheet-clip">
        <div className="p3d-sheet" aria-hidden="true">
          <div className="p3d-grab" />
          <div className="p3d-msg me">Where can I snorkel near Esperanza?</div>
          <div className="p3d-reply">
            <div className="p3d-msg ai typing"><i /><i /><i /></div>
            <div className="p3d-msg ai answer">
              Esperanza Pier: calm, shallow, easy entry off the malecón. I’ve pinned it and the
              nearest beach.
              <span className="p3d-chip">Pinned on your map</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar drawn in HTML so it stays fixed while the map zooms, and so
          "Ask AI" can light up during the conversation, like the real app. */}
      <nav className="p3d-tabs" aria-hidden="true">
        <span className="p3d-tab t-explore">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="m16.2 7.8-2 6.4-6.4 2 2-6.4z" /></svg>Explore
        </span>
        <span className="p3d-tab t-ai">
          <svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" /></svg>Ask AI
        </span>
        <span className="p3d-tab">
          <svg viewBox="0 0 24 24"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" /></svg>Saved
        </span>
        <span className="p3d-tab">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>Profile
        </span>
      </nav>
    </div>
  )
}
