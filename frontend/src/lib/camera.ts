import maplibregl from 'maplibre-gl'

/**
 * The one place that moves the camera for a *selection*.
 *
 * Why this exists: selecting a pin starts a flyTo and, in the same click,
 * snaps the mobile sheet (or opens the desktop detail panel). That changes the
 * map insets, the padding effect in MapView re-runs, and any new camera call
 * stops the one in flight. Before this module that second call was an easeTo
 * with no zoom, so the fly-in was cut off ~50ms in and the camera stayed near
 * the starting zoom — "I tap a pin and it doesn't zoom in".
 *
 * The director remembers the shot it is flying. When the padding changes
 * mid-flight, `reframe` re-aims the *same* shot with the new padding over the
 * time that flight had left, instead of starting a different move.
 *
 * Reduced motion needs no code here: MapLibre turns flyTo/easeTo into a jump
 * when `prefers-reduced-motion` is set, unless a call passes `essential: true`
 * — and none of these do.
 */

type Padding = maplibregl.PaddingOptions

/** Where a shot ends up. Points get a fixed zoom; lines are fitted to the inset box. */
export type ShotTarget =
  | { type: 'point'; center: [number, number]; zoom: number }
  | { type: 'bounds'; bounds: maplibregl.LngLatBounds; maxZoom: number }

export type Shot = {
  target: ShotTarget
  pitch: number
  bearing: number
}

/** Length of the selection fly-in. Long enough to read as travel, short enough not to wait on. */
export const FLY_MS = 1600
/** Leaving a place: quicker than arriving. */
const SETTLE_MS = 700
/** Plain re-centre when the chrome moves and nothing is in flight (unchanged from before). */
const REFRAME_MS = 400
/** A mid-flight re-aim never gets less than this, or the last few frames would snap. */
const MIN_REAIM_MS = 250

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Turn a shot into concrete camera options for the current padding.
 *
 * Bounds are resolved through cameraForBounds every time rather than once,
 * because the zoom that fits a trail depends on how much of the screen the
 * sheet is covering — which is exactly what changes mid-flight.
 */
function resolve(map: maplibregl.Map, shot: Shot, padding: Padding): maplibregl.EaseToOptions | null {
  if (shot.target.type === 'point') {
    return {
      center: shot.target.center,
      zoom: shot.target.zoom,
      pitch: shot.pitch,
      bearing: shot.bearing,
      padding,
    }
  }
  const cam = map.cameraForBounds(shot.target.bounds, {
    padding,
    maxZoom: shot.target.maxZoom,
    bearing: shot.bearing,
  })
  if (!cam) return null
  return { center: cam.center, zoom: cam.zoom, pitch: shot.pitch, bearing: shot.bearing }
}

export class CameraDirector {
  private shot: Shot | null = null
  private endsAt = 0
  private readonly map: maplibregl.Map

  constructor(map: maplibregl.Map) {
    this.map = map
    // A real gesture (drag, pinch, wheel) cancels our flight in MapLibre; stop
    // treating it as in flight too, or the next padding change would yank the
    // camera back onto a shot the user has deliberately left.
    map.on('movestart', (e: { originalEvent?: Event }) => {
      if (e.originalEvent) this.endsAt = 0
    })
  }

  /** Is there a selection shot this director is responsible for framing? */
  get active() {
    return this.shot !== null
  }

  /** Fly to a new shot. */
  fly(shot: Shot, padding: Padding) {
    const opts = resolve(this.map, shot, padding)
    if (!opts) return
    this.shot = shot
    this.endsAt = performance.now() + FLY_MS
    this.map.flyTo({ ...opts, duration: FLY_MS, curve: 1.6, easing: easeInOutCubic })
  }

  /**
   * The chrome moved (sheet snap, panel open/close).
   *
   * Mid-flight: finish the same shot under the new padding in the time left.
   * Otherwise: keep the current shot framed (no pitch/bearing change, so a
   * user who rotated the map keeps their rotation), or just re-pad.
   */
  reframe(padding: Padding) {
    const remaining = this.endsAt - performance.now()
    if (this.shot && remaining > 0) {
      const opts = resolve(this.map, this.shot, padding)
      if (opts) {
        this.map.easeTo({ ...opts, duration: Math.max(remaining, MIN_REAIM_MS), easing: easeOutCubic })
        return
      }
    }
    if (this.shot) {
      const opts = resolve(this.map, this.shot, padding)
      if (opts) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pitch, bearing, ...frame } = opts
        this.map.easeTo({ ...frame, padding, duration: REFRAME_MS })
        return
      }
    }
    this.map.easeTo({ padding, duration: REFRAME_MS })
  }

  /** Leaving a place: lay the map back flat and step out one zoom level. */
  settle(padding: Padding) {
    const wasTilted = this.map.getPitch() > 1
    this.shot = null
    this.endsAt = 0
    if (!wasTilted) return
    this.map.easeTo({
      pitch: 0,
      zoom: Math.max(this.map.getZoom() - 1, 12),
      padding,
      duration: SETTLE_MS,
      easing: easeOutCubic,
    })
  }

  /** Something else (category framing, AI pins, a trip) took the camera over. */
  release() {
    this.shot = null
    this.endsAt = 0
  }
}

/**
 * Choose the camera for arriving at a single point.
 *
 * `current` is the camera right now, so a shot can build on where the user
 * already is (never zooming *out* to arrive, keeping a rotation they chose).
 */
export function pointShot(
  center: [number, number],
  current: { zoom: number; pitch: number; bearing: number },
): Shot {
  // Close enough to read the place and its surroundings, never zooming out
  // to arrive. Tilted for an "arriving" feel but below ~60°, where an empty
  // horizon shows until terrain/sky land. Bearing is kept: a fixed offset
  // would compound with every tap and leave the map spun around.
  return {
    target: { type: 'point', center, zoom: Math.max(current.zoom, 16.5) },
    pitch: 50,
    bearing: current.bearing,
  }
}
