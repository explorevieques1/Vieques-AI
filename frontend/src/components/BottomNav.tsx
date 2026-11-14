import { Compass, Heart, Menu, Sparkles, User } from 'lucide-react'

import type { ShellMode } from '../lib/shell'
import { LIQUID_GLASS } from '../lib/glass'
import GlassSurface from './reactbits/GlassSurface'

type Props = {
  mode: ShellMode
  onChange: (m: ShellMode) => void
  /** Tint for the active Explore cell — the current category's accent. */
  accent?: string
  /** Free trial spent: the quiet nudge that used to live on the top bar. */
  showCreditDot?: boolean
}

const ITEMS: { mode: ShellMode; label: string; Icon: typeof Compass }[] = [
  { mode: 'explore', label: 'Explore', Icon: Compass },
  { mode: 'ai', label: 'Ask AI', Icon: Sparkles },
  { mode: 'saved', label: 'Saved', Icon: Heart },
  { mode: 'profile', label: 'Profile', Icon: User },
  // Far right: the ☰ list in the sheet (MenuBody). Replaced the floating ☰
  // button that used to sit on the map under the category row.
  { mode: 'menu', label: 'Menu', Icon: Menu },
]

/**
 * The five things the app does, and the only way to switch between them on a
 * phone. Each one swaps what the map sheet is showing rather than navigating —
 * see lib/shell.ts.
 *
 * Icon-only, floating capsule. Labels live in aria-label/title so screen
 * readers and long-press tooltips still name each tab.
 *
 * Three details here are load-bearing rather than cosmetic:
 *
 *  - `z-[60]` beats the sheet's `z-50` (ui/drawer.tsx). At the FULL snap the
 *    sheet covers the whole screen, and a nav underneath it would be invisible
 *    and unclickable exactly when the user most needs a way out.
 *  - `pointer-events-auto` because the sheet is a modal Radix dialog whatever
 *    vaul is told about `modal` (see the note in MapTopBar), and a modal dialog
 *    sets `pointer-events: none` on <body>. Anything over the map that does not
 *    opt back in is dead to touch.
 *  - `touch-action: manipulation` suppresses the double-tap-to-zoom delay. Without
 *    it a quick double tap on a nav cell reaches the map underneath as a zoom.
 *
 * LIQUID GLASS (React Bits GlassSurface)
 * ------------------------------------
 * The capsule is see-through so the results list and map stay readable under
 * it — panels already scroll beneath it (they pad by --nav-clear). How it
 * renders depends on the browser, by the component's own design:
 *  - Chromium (Android, desktop Chrome): real refraction via an SVG backdrop
 *    filter, plus a 35% dark tint so the grey icons hold contrast when a bright
 *    thumbnail or map tile passes under them.
 *  - Safari / iOS and Firefox: SVG backdrop filters are unsupported there, and
 *    the WebGL path needs a `backdrop` element to sample — the MapLibre canvas
 *    can't be (preserveDrawingBuffer is off), so these get the frosted
 *    fallback: 12px blur, sheen and rim. That is what most iPhones will see.
 * Do NOT put `filter`, `opacity < 1` or `will-change` on an ancestor: any of
 * them makes that ancestor the backdrop root, and the glass would then refract
 * nothing (a transparent pill). Nor a Tailwind `shadow-*` on the surface —
 * it would replace the component's inset rim shadows.
 * `color-scheme: dark` pins its light-dark() colours to the dark side; the app
 * is dark-only but never declares a colour scheme.
 *
 * ONLY AT THE LOWEST STOP: the nav fades out as the sheet rises off its floor
 * and back in as it returns (MapSheet's useSheetMotion + .vq-bottom-nav in
 * index.css). So once a pin is open or a list is up, leaving it means pulling
 * the sheet down — same as Apple Maps.
 *
 * Tapping the cell you are already on collapses the sheet — "I picked this,
 * now let me see the map" is the same gesture as the map-drag collapse.
 */
export default function BottomNav({ mode, onChange, accent, showCreditDot }: Props) {
  return (
    // Floating capsule (Instagram/Facebook style): inset from the screen edges
    // and lifted by --nav-offset, so map shows around it. The space it takes is
    // published as --nav-clear (index.css) for the panels that scroll under it.
    <nav
      aria-label="Main"
      className="vq-bottom-nav pointer-events-auto fixed z-[60]"
      style={{
        touchAction: 'manipulation',
        // Sits INSIDE the collapsed sheet, lined up with its search field:
        // 27px = the sheet's 10px side gap + 1px border + 16px (px-4) padding.
        // At 12px it was wider than the sheet's interior and read as hanging
        // off the sheet's edge. Change with .vq-map-sheet's gap in index.css.
        left: 'max(27px, calc(env(safe-area-inset-left) + 17px))',
        right: 'max(27px, calc(env(safe-area-inset-right) + 17px))',
        bottom: 'var(--nav-offset)',
      }}
    >
      <GlassSurface
        width="100%"
        height={56}
        borderRadius={28}
        // Shared with TopBento — see lib/glass.ts for why each value.
        {...LIQUID_GLASS}
        className="vq-glass vq-nav-glass mx-auto max-w-md"
      >
        <div className="grid h-full w-full grid-cols-5 gap-1">
        {ITEMS.map(({ mode: m, label, Icon }) => {
          const active = mode === m
          // Explore carries the active category's colour so "I am in Beaches" is
          // the same hue in the pill row, the results header and here. The other
          // three have no category, so they use the app's primary.
          const tint = active && m === 'explore' && accent ? accent : undefined
          return (
            <button
              key={m}
              onClick={() => onChange(m)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={`relative flex items-center justify-center rounded-full transition-colors duration-200 ${
                active
                  ? 'bg-white/12 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
              style={tint ? { color: tint } : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {m === 'profile' && showCreditDot && (
                <span className="absolute right-[calc(50%-1.1rem)] top-2.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-background" />
              )}
            </button>
          )
        })}
        </div>
      </GlassSurface>
    </nav>
  )
}
