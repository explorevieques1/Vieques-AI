import { Heart } from 'lucide-react'

import { formatMiles } from '../lib/geo'
import type { Place } from '../lib/place'

type Props = {
  place: Place
  selected: boolean
  onSelect: (p: Place) => void
  /** Miles from the user, when geolocation is available. Omitted otherwise. */
  distanceMi?: number
  /** Optional so every existing caller keeps its current behaviour. */
  saved?: boolean
  /** When given, the card grows a heart in its top-right corner. */
  onToggleSave?: (p: Place) => void
}

/**
 * One row in the results list: icon tile, name, subtitle, tags, distance.
 * Selected rows get the teal wash from the mockups so the map pin and the list
 * row read as the same selection.
 *
 * The root is a positioned wrapper, not the button itself, because the heart
 * cannot live inside it: a <button> inside a <button> is invalid HTML, and
 * browsers resolve it by hoisting the inner one out — which in practice means
 * the two fight over the click and saving a place also selects it. So the
 * selector button and the heart are siblings, and the heart stops propagation.
 */
function PlaceCard({ place, selected, onSelect, distanceMi, saved, onToggleSave }: Props) {
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => onSelect(place)}
        aria-current={selected}
        className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
          selected
            ? 'border-primary/40 bg-gradient-to-br from-primary/15 to-accent-sky/5'
            : 'border-white/6 bg-white/2 hover:bg-white/5'
        }`}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/8 text-lg"
          style={{ background: `${place.icon.color}22` }}
          aria-hidden="true"
        >
          {place.icon.emoji}
        </span>

        {/* pr-7 keeps a long name from running under the heart. Only paid when
            the heart is actually there. */}
        <span className={`min-w-0 flex-1 ${onToggleSave ? 'pr-7' : ''}`}>
          <span className="block truncate text-sm font-semibold text-foreground">{place.name}</span>
          {place.subtitle && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {place.subtitle}
            </span>
          )}
          {place.tags.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {place.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-foreground/80"
                >
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>

        {/* Bottom-aligned rather than top: the heart owns the top-right corner. */}
        {distanceMi != null && (
          <span
            className={`shrink-0 self-end font-mono text-[10px] ${
              selected ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            {formatMiles(distanceMi)}
          </span>
        )}
      </button>

      {onToggleSave && (
        <button
          onClick={(e) => {
            // The wrapper is not the selector, but the click would still bubble
            // to any parent handler — and on touch a missed tap on the heart
            // should do nothing, not open the place.
            e.stopPropagation()
            onToggleSave(place)
          }}
          aria-label={saved ? `Remove ${place.name} from saved` : `Save ${place.name}`}
          aria-pressed={saved}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
        >
          <Heart
            size={15}
            className={saved ? 'text-primary' : ''}
            fill={saved ? 'currentColor' : 'none'}
          />
        </button>
      )}
    </div>
  )
}

export default PlaceCard
