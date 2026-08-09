import { useState } from 'react'
import { CalendarDays, ChevronRight, Plus, Trash2 } from 'lucide-react'

import type { Itineraries } from '../hooks/useItineraries'
import { formatDateRange, tripDayCount } from '../lib/api'
import type { Place } from '../lib/place'
import { Skeleton } from './ui/skeleton'
import TripDetailBody from './TripDetailBody'
import TripForm from './TripForm'
import UpsellOverlay from './UpsellOverlay'

type Props = {
  itineraries: Itineraries
  onSelect: (p: Place) => void
  navPad?: boolean
  /** Below Exploration: show the upsell instead of the planner. */
  locked?: boolean
}

type View = 'list' | 'create' | 'edit'

/**
 * The trip planner's top level — and its router.
 *
 * Three views share the one pane (list → detail → form), exactly as the mobile
 * sheet and the desktop left panel both render this same component. The view
 * state is local: ShellMode stays flat at four values, because a trip is
 * somewhere you are *within* Saved, not a fifth thing the app does.
 *
 * 'edit' does not carry its own copy of the trip — it reads `itineraries.activeTrip`,
 * which is already open whenever edit is reachable (the only way in is the pencil
 * button inside TripDetailBody). That keeps the view state to three bare strings,
 * as the routing model calls for, instead of a union with a payload.
 */
export default function TripsBody({
  itineraries, onSelect, navPad = false, locked = false,
}: Props) {
  const [view, setView] = useState<View>('list')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const { trips, loading, activeTrip, activeLoading, error, clearError } = itineraries

  const pad = navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'

  if (locked) {
    return (
      <UpsellOverlay
        feature="itinerary"
        title="Multi-day itinerary builder"
        blurb="Build day-by-day plans, drop your saved places onto each day, and see the whole trip on the map."
        overlay
      />
    )
  }

  // ---- view 2: a trip is open --------------------------------------------
  if (activeTrip && view === 'list') {
    return (
      <TripDetailBody
        trip={activeTrip}
        itineraries={itineraries}
        onBack={itineraries.close}
        onSelect={onSelect}
        onEdit={() => setView('edit')}
        navPad={navPad}
      />
    )
  }

  // ---- create / edit forms ------------------------------------------------
  if (view === 'create' || (view === 'edit' && activeTrip)) {
    const editing = view === 'edit' ? activeTrip ?? undefined : undefined
    return (
      <>
        <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-4">
          <h2 className="font-display text-xl leading-none tracking-tight">
            {editing ? 'Edit trip' : 'New trip'}
          </h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {editing ? 'Name and dates' : 'Name it, then pick your dates'}
          </p>
        </div>
        <TripForm
          initial={editing}
          submitting={busy}
          error={error}
          onCancel={() => { clearError(); setView('list') }}
          onSubmit={async (input) => {
            setBusy(true)
            const ok = editing
              ? await itineraries.rename(editing.id, input)
              : Boolean(await itineraries.create(input))
            setBusy(false)
            if (ok) setView('list')
          }}
        />
      </>
    )
  }

  // ---- view 1: the list ----------------------------------------------------
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 pb-3 pt-4">
        <div>
          <h2 className="font-display text-xl leading-none tracking-tight">Trips</h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {loading ? 'Loading…' : `${trips.length} trip${trips.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => { clearError(); setView('create') }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
        >
          <Plus size={14} />
          New trip
        </button>
      </div>

      <div className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-3 ${pad}`}>
        {(loading || activeLoading) &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
          ))}

        {error && !loading && (
          <p role="alert" className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        {!loading && trips.length === 0 && (
          <div className="px-2 py-10 text-center">
            <CalendarDays size={22} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-foreground">No trips yet</p>
            <p className="mx-auto mt-1.5 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              Create one, pick your dates, and drop your saved places onto each
              day.
            </p>
          </div>
        )}

        {!loading && trips.map((t) => {
          const days = tripDayCount(t)
          return (
            <div key={t.id} className="relative">
              <button
                onClick={() => itineraries.open(t.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3 pr-16 text-left hover:bg-white/[0.06]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <CalendarDays size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatDateRange(t)}
                    {days > 0 && ` · ${days} day${days === 1 ? '' : 's'}`}
                    {` · ${t.itemCount} place${t.itemCount === 1 ? '' : 's'}`}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </button>

              <button
                onClick={() => setConfirmDelete(t.id)}
                aria-label={`Delete ${t.title}`}
                className="absolute right-9 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground/70 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>

              {confirmDelete === t.id && (
                <div className="mt-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs text-foreground">
                    Delete &ldquo;{t.title}&rdquo; and everything planned in it?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Keep
                    </button>
                    <button
                      onClick={async () => {
                        await itineraries.remove(t.id)
                        setConfirmDelete(null)
                      }}
                      className="flex-1 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
