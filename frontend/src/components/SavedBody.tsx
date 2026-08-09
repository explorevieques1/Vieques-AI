import { useState } from 'react'
import { Heart } from 'lucide-react'

import type { Favorites } from '../hooks/useFavorites'
import type { Itineraries } from '../hooks/useItineraries'
import type { Place } from '../lib/place'
import PlaceCard from './PlaceCard'
import TripsBody from './TripsBody'
import { Skeleton } from './ui/skeleton'

type Props = {
  favorites: Favorites
  itineraries: Itineraries
  selectedId: string | null
  onSelect: (p: Place) => void
  /** Miles from the user, keyed by place id. */
  distances: Map<string, number>
  /** Desktop only. */
  onClose?: () => void
  /** Mobile: clear the bottom nav with the scroller's bottom padding. */
  navPad?: boolean
  /** Below Exploration — Trips shows the upsell. TripsBody renders it itself. */
  tripsLocked?: boolean
  /** Per-place "add to trip", surfaced on each card in the Places segment. */
  onAddToTrip?: (p: Place) => void
}

type Segment = 'places' | 'trips'

/**
 * Saved — two segments over one surface.
 *
 * `places` is the original heart list; `trips` is the planner. They live
 * together because the flow that makes either useful is "save a place, then
 * drop it on a day", and splitting them across the nav would put a hop in the
 * middle of it. Trips is the default: the planner is the reason to come here.
 *
 * Identical on both platforms — this component is what the mobile sheet renders
 * and what the desktop left panel renders, so the planner needed no separate
 * desktop implementation.
 *
 * No `onUpgrade` prop: TripsBody renders UpsellOverlay itself when locked, and
 * that overlay already links out to `${LANDING_URL}/pricing` on its own, so
 * there is nothing for this layer to wire through.
 */
export default function SavedBody({
  favorites, itineraries, selectedId, onSelect, distances,
  onClose, navPad = false, tripsLocked = false, onAddToTrip,
}: Props) {
  const [segment, setSegment] = useState<Segment>('trips')
  const { places, loading, toggle } = favorites

  const tab = (id: Segment, label: string, count?: number) => (
    <button
      key={id}
      onClick={() => setSegment(id)}
      aria-pressed={segment === id}
      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        segment === id
          ? 'bg-white/10 text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}</span>
      )}
    </button>
  )

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-white/[0.04] p-1">
          {tab('trips', 'Trips', itineraries.trips.length)}
          {tab('places', 'Places', places.length)}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close saved"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {segment === 'trips' ? (
        <TripsBody
          itineraries={itineraries}
          onSelect={onSelect}
          navPad={navPad}
          locked={tripsLocked}
        />
      ) : (
        <>
          <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-3">
            <h2 className="font-display text-xl leading-none tracking-tight">Saved</h2>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {loading ? 'Loading…' : `${places.length} place${places.length === 1 ? '' : 's'}`}
            </p>
          </div>

          <div
            className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 ${
              navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
            }`}
          >
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
              ))}

            {!loading && places.length === 0 && (
              <div className="px-2 py-10 text-center">
                <Heart size={22} className="mx-auto text-muted-foreground/50" />
                <p className="mt-3 text-sm text-foreground">Nothing saved yet</p>
                <p className="mx-auto mt-1.5 max-w-[24ch] text-xs leading-relaxed text-muted-foreground">
                  Tap the heart on any beach, restaurant or stay to keep it here.
                </p>
              </div>
            )}

            {!loading &&
              places.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  selected={p.id === selectedId}
                  onSelect={onSelect}
                  distanceMi={distances.get(p.id)}
                  saved
                  onToggleSave={toggle}
                  onAddToTrip={onAddToTrip}
                />
              ))}
          </div>
        </>
      )}
    </>
  )
}
