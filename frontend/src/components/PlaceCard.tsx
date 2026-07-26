import type { Place } from '../lib/place'

type Props = {
  place: Place
  selected: boolean
  onSelect: (p: Place) => void
  /** Miles from the user, when geolocation is available. Omitted otherwise. */
  distanceMi?: number
}

/**
 * One row in the results list: icon tile, name, subtitle, tags, distance.
 * Selected rows get the teal wash from the mockups so the map pin and the list
 * row read as the same selection.
 */
function PlaceCard({ place, selected, onSelect, distanceMi }: Props) {
  return (
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

      <span className="min-w-0 flex-1">
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

      {distanceMi != null && (
        <span
          className={`shrink-0 font-mono text-[10px] ${
            selected ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {distanceMi.toFixed(1)}mi
        </span>
      )}
    </button>
  )
}

export default PlaceCard
