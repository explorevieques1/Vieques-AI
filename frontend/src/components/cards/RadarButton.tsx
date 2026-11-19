import { useEffect } from 'react'
import { Radar } from 'lucide-react'

import { preloadSounds, unlockSound } from '../../lib/sound'
import { GlassButton } from '../GlassControl'

/**
 * Vieques Cards radar toggle (docs/CARD_UI_SPEC.md S-1, I-1): a 48px
 * GlassControl in the map's right control stack, below recentre.
 * Off = muted icon; on = teal icon + 6px dot; `aria-pressed`.
 *
 * Tiny and always mounted, so it lives in the map bundle; the radar pill and
 * its WebGL sweep are the lazy part (C-3).
 */

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

let askedMotion = false

export default function RadarButton({ on, onToggle }: { on: boolean; onToggle: (next: boolean) => void }) {
  // I-1: have the sound engine in memory before the first tap, so that tap
  // can unlock iOS audio synchronously (lib/sound.ts unlockSound()).
  useEffect(() => {
    void preloadSounds().catch(() => undefined)
  }, [])

  const handleTap = () => {
    if (!on) {
      // I-1: both only from inside this tap handler.
      unlockSound()
      if (!askedMotion) {
        askedMotion = true
        // iOS 13+ only; elsewhere the method does not exist and motion is free.
        const req = (globalThis.DeviceOrientationEvent as unknown as MotionPermission | undefined)
          ?.requestPermission
        if (typeof req === 'function') {
          void req.call(globalThis.DeviceOrientationEvent).catch(() => undefined)
        }
      }
    }
    onToggle(!on)
  }

  return (
    <GlassButton label="Card radar" pressed={on} onClick={handleTap}>
      <span className="relative grid place-items-center">
        <Radar size={19} className={on ? 'text-primary' : 'text-muted-foreground'} />
        {on && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
      </span>
    </GlassButton>
  )
}
