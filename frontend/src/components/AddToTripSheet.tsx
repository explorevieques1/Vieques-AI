import { useState } from 'react'
import { CalendarDays, Check, X } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import { formatDateRange, tripDayCount, type Trip } from '../lib/api'
import type { Place } from '../lib/place'

type Props = {
  place: Place
  itineraries: Itineraries
  onClose: () => void
}

/**
 * "Add to trip" — pick a trip, then a day.
 *
 * Two steps rather than one flat list: a 14-day trip times N trips is too many
 * buttons to scan, and the trip is the choice the user has already made in
 * their head. A dateless trip skips step two entirely.
 *
 * Renders above EVERYTHING, including the mobile bottom sheet and bottom nav.
 * Those already fight for z-50/z-[60] (see BottomNav.tsx's note on beating the
 * vaul drawer) — this is a modal picker launched from inside that sheet, so it
 * needs headroom above both rather than tying with the nav at z-[60].
 */
export default function AddToTripSheet({ place, itineraries, onClose }: Props) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { trips, error } = itineraries

  const commit = async (t: Trip, dayIndex: number | null) => {
    setBusy(true)
    const ok = await itineraries.addPlace(t.id, place, dayIndex)
    setBusy(false)
    if (ok) {
      setDone(true)
      setTimeout(onClose, 700)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        aria-label="Close add to trip"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-background p-4 pb-[calc(1rem+var(--sab))] shadow-2xl sm:rounded-3xl sm:pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg leading-tight tracking-tight">
              {trip ? `Which day?` : 'Add to trip'}
            </h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {trip ? trip.title : place.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {done && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-300">
            <Check size={15} /> Added to {trip?.title}
          </p>
        )}

        {!done && error && (
          <p role="alert" className="mb-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        {!done && !trip && (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {trips.length === 0 && (
              <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                No trips yet. Create one in Saved → Trips, then add places to it.
              </p>
            )}
            {trips.map((t) => (
              <button
                key={t.id}
                disabled={busy}
                onClick={() => (tripDayCount(t) === 0 ? commit(t, null) : setTrip(t))}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-left hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <CalendarDays size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDateRange(t)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {!done && trip && (
          <div className="max-h-[50vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: tripDayCount(trip) }, (_, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => commit(trip, i)}
                  className="rounded-xl border border-white/10 px-3.5 py-2 text-sm text-foreground hover:bg-white/8 disabled:opacity-50"
                >
                  Day {i + 1}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() => commit(trip, null)}
                className="rounded-xl border border-dashed border-white/15 px-3.5 py-2 text-sm text-muted-foreground hover:bg-white/8 hover:text-foreground disabled:opacity-50"
              >
                Unscheduled
              </button>
            </div>
            <button
              onClick={() => setTrip(null)}
              className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              ‹ Pick a different trip
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
