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
    <nav
      aria-label="Main"
      className="glass pointer-events-auto fixed inset-x-0 bottom-0 z-[60] grid grid-cols-4
                 border-t border-white/8 pad-safe-bottom"
      style={{ touchAction: 'manipulation' }}
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
            className={`relative flex h-14 flex-col items-center justify-center gap-1 transition-colors ${
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={tint ? { color: tint } : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
            {m === 'profile' && showCreditDot && (
              <span className="absolute right-[calc(50%-1.15rem)] top-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-background" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
