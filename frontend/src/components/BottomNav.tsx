import { Compass, Heart, Sparkles, User } from 'lucide-react'

import type { ShellMode } from '../lib/shell'

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
]

/**
 * The four things the app does, and the only way to switch between them on a
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
      className="pointer-events-auto fixed z-[60]"
      style={{
        touchAction: 'manipulation',
        left: 'max(0.75rem, env(safe-area-inset-left))',
        right: 'max(0.75rem, env(safe-area-inset-right))',
        bottom: 'var(--nav-offset)',
      }}
    >
      <div
        className="glass mx-auto grid h-16 max-w-md grid-cols-4 gap-1 rounded-full p-1.5
                   shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      >
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
              <Icon size={24} strokeWidth={active ? 2.4 : 2} aria-hidden />
              {m === 'profile' && showCreditDot && (
                <span className="absolute right-[calc(50%-1.1rem)] top-2.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-background" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
