import type { GlassSurfaceProps } from '../components/reactbits/GlassSurface'

/**
 * The one liquid-glass tuning for the map's floating chrome — the bottom nav
 * and the top bento share it so the two ends of the screen match.
 *
 * Tuned for TEXT and map tiles underneath, not the React Bits demo's photo:
 *  - redOffset/greenOffset/blueOffset all 0: the defaults (0/10/20) split text
 *    into RGB fringes and put a rainbow on curved ends.
 *  - distortionScale -70: a gentle edge bend rather than the demo's -180.
 *  - displace 2: a light blur, so what is underneath reads as "under glass"
 *    instead of as garbled glyphs.
 *  - backgroundOpacity 0.35: a dark tint so grey icons and text keep contrast
 *    over bright sand and water (Chromium refraction path).
 * Safari/iOS and Firefox get the component's frosted fallback; its tint is
 * overridden to the app's navy by `.vq-glass` in index.css.
 *
 * `colorScheme: 'dark'` pins the component's light-dark() colours: the app is
 * dark-only but never declares a colour scheme. Pass `className="vq-glass"`
 * with these so the content padding and fallback tint apply.
 */
export const LIQUID_GLASS: GlassSurfaceProps = {
  backgroundOpacity: 0.35,
  distortionScale: -70,
  redOffset: 0,
  greenOffset: 0,
  blueOffset: 0,
  displace: 2,
  saturation: 1.4,
  style: { colorScheme: 'dark' },
}
