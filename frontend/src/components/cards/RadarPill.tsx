import { useMemo, useSyncExternalStore } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

import type { RadarBucket } from '../../lib/api'
import { LIQUID_GLASS } from '../../lib/glass'
import { isSoundMuted, setSoundMuted, subscribeSoundMuted } from '../../lib/sound'
import type { CardRadarState } from '../../hooks/useCardRadar'
import { CARDS_FLOAT_GAP, RADAR_PILL_H, RADAR_PILL_RADIUS } from '../../hooks/useMapInsets'
import GlassSurface from '../reactbits/GlassSurface'
import Radar from '../reactbits/Radar'

/**
 * Vieques Cards radar pill (docs/CARD_UI_SPEC.md S-2, L-1, L-3, L-4, G-1, G-2,
 * W-2, I-3). Lazy-loaded by MapView (C-3) and mounted only while the radar is on,
 * so the Radar WebGL context exists only then.
 *
 * Copy is final (S-2); the warmth word is the server's, shown verbatim.
 */

/** Same denser tint as the map controls (GlassControl's CONTROL_GLASS): the
 *  pill sits straight on bright map tiles, where 35% reads see-through. */
const PILL_GLASS = { ...LIQUID_GLASS, backgroundOpacity: 0.65 }

/** Radar blips per count bucket (Card UI Mapping p.5: "1 / 2–3 / 4 blips"). */
const TARGETS: Record<RadarBucket, number> = { '0': 0, '1': 1, '2-3': 3, '4+': 4 }
const COUNT_LABEL: Record<RadarBucket, string> = { '0': '0', '1': '1', '2-3': '2–3', '4+': '4+' }

function statusCopy(radar: CardRadarState, onMap: number, canCollect: boolean): { text: string; warmth: string | null } {
  switch (radar.status) {
    case 'scanning':
      return { text: 'Scanning…', warmth: null }
    case 'none':
      // The radar counts only cards still hidden; ones already revealed are
      // pins. "No cards nearby" next to an uncollected pin reads as broken.
      // A laptop can't collect (S-10), so it isn't told to go and collect.
      if (onMap > 0) return { text: `${onMap} on the map${canCollect ? ' · go collect' : ''}`, warmth: null }
      return { text: 'No cards nearby · explore', warmth: null }
    case 'signal':
      return { text: `${COUNT_LABEL[radar.count]} nearby`, warmth: radar.warmth }
    case 'weak':
      return { text: 'Weak GPS · step outside', warmth: null }
    case 'offIsland':
      return { text: 'Cards live on Vieques', warmth: null }
    case 'blocked':
      return { text: 'Turn on location to hunt cards', warmth: null }
  }
}

/** Desktop / tablet placement (S-10): top-left of the map band, under
 *  MapTopBar, beside whatever floating panel is open. */
export type RadarPillDesktop = { left: number; top: number; maxWidth: number }

export default function RadarPill({
  radar,
  hidden,
  lift = 0,
  desktopAt,
  onMap = 0,
  canCollect = true,
}: {
  radar: CardRadarState
  /** Revealed, collectable cards within radar range (already pins on the map). */
  onMap?: number
  /** Fine pointer (laptop) can't collect, so the pill drops "go collect" (S-10). */
  canCollect?: boolean
  /** Set on desktop (S-10); omitted on a phone, where the pill rides the sheet (L-3). */
  desktopAt?: RadarPillDesktop
  /** L-3: px to rise by so the pill sits above the nearby banner (its
   *  measured height + gap), 0 when no banner shows. */
  lift?: number
  /** L-4: sheet at full or a z-70 overlay open. The pill stays mounted (so
   *  the WebGL context isn't rebuilt on every drag) but the Radar pauses (W-2). */
  hidden: boolean
}) {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted)
  // The Radar parses its colour on a 2D canvas, where `var(--primary)` means
  // nothing — resolve the token's value once (T-1: no raw colour here).
  const teal = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    [],
  )

  const { text, warmth } = statusCopy(radar, onMap, canCollect)
  const { status } = radar
  // Card UI Mapping p.5: weak GPS / off the island = paused; blocked = no radar.
  const showRadar = status !== 'blocked'
  const sweeping = status === 'scanning' || status === 'none' || status === 'signal'

  return (
    <div
      // L-1: fixed, z-30, pointer-events-auto (vaul puts pointer-events:none on
      // <body>). L-3: rides the sheet's live top edge. No opacity / filter /
      // transform here — this is an ancestor of glass (G-2); the fade is on the
      // GlassSurface itself.
      className="pointer-events-auto fixed z-30"
      style={{
        ...(desktopAt
          ? // S-10: top-left under MapTopBar, in the band between the panels.
            { left: desktopAt.left, top: desktopAt.top, maxWidth: desktopAt.maxWidth }
          : {
              left: '1.25rem',
              // Never under the 48px control stack on the right (320px phones):
              // both 1.25rem gutters + the button + an 8px gap.
              maxWidth: 'calc(100vw - 2.5rem - 56px)',
              bottom: `calc(100dvh - var(--controls-y, calc(100dvh - 176px)) + ${CARDS_FLOAT_GAP + lift}px)`,
            }),
        visibility: hidden ? 'hidden' : 'visible',
      }}
      aria-hidden={hidden || undefined}
    >
      <GlassSurface
        {...PILL_GLASS}
        width="auto"
        height={RADAR_PILL_H}
        borderRadius={RADAR_PILL_RADIUS}
        className="vq-glass vq-glass--tight"
        style={{
          ...PILL_GLASS.style,
          // L-4: gone by the time the sheet is half-way from middle to full.
          opacity: hidden ? 0 : 'calc(1 - var(--sheet-full, 0) * 2)',
        }}
      >
        <div className="flex h-full min-w-0 items-center gap-2 pr-0.5 pl-0.5">
          {showRadar && (
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full" aria-hidden="true">
              <Radar
                color={teal}
                mode="sweep"
                ringCount={3}
                spokeCount={0}
                mouseInteraction={false}
                intro={false}
                grain={0}
                targets={status === 'signal' ? TARGETS[radar.count] : 0}
                // "Nothing within 1 km" = slow sweep (Card UI Mapping p.5).
                speed={status === 'none' ? 0.5 : 1}
                // W-2: static frame when hidden or in a state with nothing to
                // scan. The component also stops on document.hidden and honours
                // prefers-reduced-motion itself (M-3).
                paused={hidden || !sweeping}
              />
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className={`min-w-0 truncate text-[13px] font-semibold text-foreground max-[359px]:text-[12px] max-[359px]:tracking-tight ${showRadar ? '' : 'pl-2'}`}
          >
            {text}
            {warmth && <span className="font-medium text-primary"> · {warmth}</span>}
          </p>
          <button
            type="button"
            onClick={() => setSoundMuted(!muted)}
            // I-3: a toggle — one label, state in aria-pressed.
            aria-label="Mute card sounds"
            aria-pressed={muted}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/8 active:bg-white/12"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      </GlassSurface>
    </div>
  )
}
