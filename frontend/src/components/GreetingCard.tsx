import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'

import type { Suggestion, Weather } from '../lib/api'
import { greetingFor, type Daypart } from '../hooks/useSuggestion'

type Props = {
  daypart: Daypart
  weather: Weather | null
  suggestion: Suggestion | null
  loadingSuggestion: boolean
  minimized: boolean
  onToggleMinimize: () => void
  /** Drops the suggestion currently shown on the map as its own pin. */
  onOpenSuggestion: (s: Suggestion) => void
  /**
   * The arrow: draw a *different* suggestion and drop that on the map. One
   * action, per §2 of the spec — the arrow is how you both reroll and go.
   */
  onNextSuggestion: () => void
}

/**
 * The greeting card: who is here, what the weather is doing, and one thing worth
 * doing about it.
 *
 * Sizing is to a 390px phone with no room to spare, which drives two decisions:
 *  - The weather sits in the slot the "Ask AI" button used to occupy. Ask AI is
 *    in the bottom nav now, and a card with its own action button plus a nav
 *    cell for the same thing is 40px of duplicate.
 *  - Minimising collapses to a weather-only pill, not a header. That gives the
 *    map 60px back, and because `mobileTopInset` knows the difference the camera
 *    actually uses them — a minimised card really does raise the visible band.
 *
 * `pointer-events-auto` is load-bearing: the map sheet is a modal Radix dialog
 * whatever vaul is told about `modal` (see the note in MapTopBar), so it sets
 * `pointer-events: none` on the body and anything over the map that does not opt
 * back in is dead to touch.
 */
export default function GreetingCard({
  daypart,
  weather,
  suggestion,
  loadingSuggestion,
  minimized,
  onToggleMinimize,
  onOpenSuggestion,
  onNextSuggestion,
}: Props) {
  const temp = weather?.tempF != null ? `${weather.tempF}°` : null

  if (minimized) {
    return (
      <div className="pointer-events-auto mx-3 sm:mx-5">
        <button
          onClick={onToggleMinimize}
          aria-expanded={false}
          aria-label="Expand greeting"
          className="glass flex w-max items-center gap-2 rounded-full px-3 py-2 text-left"
        >
          {weather ? (
            <>
              <span className="text-sm leading-none" aria-hidden="true">
                {weather.emoji}
              </span>
              <span className="text-[13px] font-medium leading-none text-foreground">{temp}</span>
              <span className="text-[13px] leading-none text-muted-foreground">
                {weather.label}
              </span>
            </>
          ) : (
            <span className="text-[13px] leading-none text-muted-foreground">
              {greetingFor(daypart)}
            </span>
          )}
          <ChevronDown size={15} className="text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div className="glass pointer-events-auto mx-3 rounded-3xl p-3 sm:mx-5">
      {/* Row A — greeting, weather, minimise. */}
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] leading-7 tracking-tight text-foreground">
          {greetingFor(daypart)}
        </h2>

        {weather && (
          <div className="flex shrink-0 items-center gap-1.5" title={weather.label}>
            <span className="text-sm leading-none" aria-hidden="true">
              {weather.emoji}
            </span>
            <span className="font-mono text-[13px] leading-none text-foreground">{temp}</span>
            {weather.highF != null && weather.lowF != null && (
              <span className="font-mono text-[10px] leading-none text-muted-foreground">
                {weather.highF}/{weather.lowF}
              </span>
            )}
          </div>
        )}

        <button
          onClick={onToggleMinimize}
          aria-expanded
          aria-label="Minimize greeting"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <ChevronUp size={15} />
        </button>
      </div>

      {/* Row B — suggestion of the day. `min-w-0` + `truncate` is what keeps a
          long title on one line instead of growing the card. */}
      <div className="mt-2 flex h-10 items-center gap-2 rounded-2xl bg-white/4 px-2.5">
        <span className="text-base leading-none" aria-hidden="true">
          {suggestion?.emoji ?? '✨'}
        </span>
        <button
          onClick={() => suggestion && onOpenSuggestion(suggestion)}
          disabled={!suggestion}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <span className="block font-mono text-[9px] uppercase leading-none tracking-[0.14em] text-muted-foreground">
            Suggestion of the day
          </span>
          <span className="mt-1 block truncate text-[13px] leading-none text-foreground">
            {loadingSuggestion && !suggestion
              ? 'Finding something…'
              : (suggestion?.title ?? 'Nothing today')}
          </span>
        </button>
        <button
          onClick={onNextSuggestion}
          aria-label="Another suggestion"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/8 text-foreground transition-colors hover:bg-white/14 disabled:opacity-40"
          disabled={loadingSuggestion}
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
