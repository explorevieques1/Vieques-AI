import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import {
  formatDateRange, tripDayCount, tripDayDate,
  type TripDetail, type TripItem,
} from '../lib/api'
import { tripItemToPlace, type Place } from '../lib/place'
import PlaceCard from './PlaceCard'

type Props = {
  trip: TripDetail
  itineraries: Itineraries
  onBack: () => void
  onSelect: (p: Place) => void
  onEdit: () => void
  navPad?: boolean
}

/** Buckets keyed by day index, plus `null` for Unscheduled. */
type Bucket = { key: number | null; label: string; sub: string; items: TripItem[] }

/**
 * One trip: its days, and the places in each.
 *
 * Items whose dayIndex exceeds the trip's CURRENT length fall into
 * Unscheduled rather than vanishing — the trip was shortened after they were
 * placed, and deleting the user's work to satisfy a date change would be the
 * wrong trade. Lengthen the trip again and they return to their day.
 */
export default function TripDetailBody({
  trip, itineraries, onBack, onSelect, onEdit, navPad = false,
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const dayCount = tripDayCount(trip)

  const buckets = useMemo<Bucket[]>(() => {
    const out: Bucket[] = []
    for (let i = 0; i < dayCount; i++) {
      const d = tripDayDate(trip, i)
      out.push({
        key: i,
        label: `Day ${i + 1}`,
        sub: d
          ? d.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
            })
          : '',
        items: [],
      })
    }
    const unscheduled: Bucket = { key: null, label: 'Unscheduled', sub: '', items: [] }
    for (const it of trip.items) {
      const i = it.dayIndex
      if (i === null || i >= dayCount) unscheduled.items.push(it)
      else out[i].items.push(it)
    }
    // Unscheduled is hidden only when a dated trip has nothing in it.
    if (unscheduled.items.length > 0 || dayCount === 0) out.push(unscheduled)
    return out
  }, [trip, dayCount])

  const dayOptions = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i),
    [dayCount],
  )

  return (
    <>
      {/* Header: back, title, dates, edit. The trip's details live here, per
          the design — the user can see and change them without leaving. */}
      <div className="flex shrink-0 items-start gap-2 border-b border-white/8 px-3 pb-3 pt-4">
        <button
          onClick={onBack}
          aria-label="Back to trips"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl leading-none tracking-tight">
            {trip.title}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <CalendarDays size={11} />
            {formatDateRange(trip)}
            <span aria-hidden>·</span>
            {trip.items.length} place{trip.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={onEdit}
          aria-label="Edit trip"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
        >
          <Pencil size={15} />
        </button>
      </div>

      <div
        className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-3 ${
          navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
        }`}
      >
        {trip.items.length === 0 && (
          <div className="px-2 py-10 text-center">
            <CalendarDays size={22} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-foreground">No places yet</p>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              Find a beach, restaurant or activity and use “Add to trip” to drop
              it on a day.
            </p>
          </div>
        )}

        {buckets.map((b) => (
          <section key={b.key ?? 'unscheduled'} className="mb-4 last:mb-0">
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {b.label}
                {b.sub && <span className="ml-1.5 normal-case tracking-normal opacity-70">{b.sub}</span>}
              </h3>
              {b.items.length > 0 && (
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {b.items.length}
                </span>
              )}
            </div>

            {b.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-muted-foreground/70">
                Nothing planned
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {b.items.map((it) => {
                  const place = tripItemToPlace(it)
                  const open = menuFor === it.placeId
                  return (
                    <div key={it.placeId} className="relative">
                      <PlaceCard place={place} selected={false} onSelect={onSelect} />
                      <button
                        onClick={() => setMenuFor(open ? null : it.placeId)}
                        aria-label={`Options for ${place.name}`}
                        aria-expanded={open}
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {open && (
                        <div className="mt-1 rounded-xl border border-white/10 bg-background/95 p-1.5 shadow-xl backdrop-blur">
                          <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Move to
                          </p>
                          <div className="flex flex-wrap gap-1 px-1 pb-1">
                            {dayOptions.map((d) => (
                              <button
                                key={d}
                                onClick={() => {
                                  itineraries.movePlace(it.placeId, d)
                                  setMenuFor(null)
                                }}
                                disabled={it.dayIndex === d}
                                className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-foreground hover:bg-white/8 disabled:opacity-35"
                              >
                                Day {d + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                itineraries.movePlace(it.placeId, null)
                                setMenuFor(null)
                              }}
                              disabled={it.dayIndex === null}
                              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-foreground hover:bg-white/8 disabled:opacity-35"
                            >
                              Unscheduled
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              itineraries.removePlace(it.placeId)
                              setMenuFor(null)
                            }}
                            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 size={13} />
                            Remove from trip
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
