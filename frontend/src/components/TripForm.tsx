import { useState } from 'react'

import { tripDayCount, type Trip, type TripInput } from '../lib/api'

type Props = {
  /** Present when editing; absent when creating. */
  initial?: Pick<Trip, 'title' | 'startDate' | 'endDate'>
  onSubmit: (input: TripInput) => void
  onCancel: () => void
  submitting?: boolean
  /** Server-side message, e.g. "Trips can span at most 14 days." */
  error?: string | null
}

const MAX_DAYS = 14

/**
 * Create / edit a trip, rendered inline in the pane rather than as a modal —
 * the sheet is the app's single display surface and a dialog over a dialog on a
 * phone is a stacking problem with no upside.
 *
 * The day count is derived and shown live, so "Mar 3 – Mar 20" fails visibly
 * while the user is still looking at the dates rather than after a round trip.
 */
export default function TripForm({
  initial, onSubmit, onCancel, submitting = false, error,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')

  const bothOrNeither = (!startDate) === (!endDate)
  const days = startDate && endDate ? tripDayCount({ startDate, endDate }) : 0
  const tooLong = days > MAX_DAYS
  const backwards = Boolean(startDate && endDate && days < 1)
  const named = title.trim().length > 0

  // Client-side twin of validateTrip in backend/itineraries.js. The server is
  // still the authority; this exists so the button is disabled before the trip.
  const localError = !bothOrNeither
    ? 'Pick both a start and an end date, or neither.'
    : backwards
      ? 'The end date comes before the start date.'
      : tooLong
        ? `Trips can span at most ${MAX_DAYS} days.`
        : null

  const valid = named && !localError
  const shown = localError ?? error ?? null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || submitting) return
    onSubmit({
      title: title.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
    })
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm ' +
    'text-foreground outline-none placeholder:text-muted-foreground ' +
    'focus:border-primary/60 focus:ring-1 focus:ring-primary/40 ' +
    '[color-scheme:dark]'

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-contain scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Trip name
          </span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Beach Days"
            aria-label="Trip name"
            className={`mt-1.5 ${field}`}
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Arrive
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value
                setStartDate(v)
                // Keep the range sane as they type: an end before the new start
                // is never what they meant.
                if (v && endDate && endDate < v) setEndDate(v)
              }}
              aria-label="Arrival date"
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Depart
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Departure date"
              className={`mt-1.5 ${field}`}
            />
          </label>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {days > 0 && !tooLong
              ? `${days} day${days === 1 ? '' : 's'} to plan`
              : 'Dates are optional — skip them for a list you fill in later.'}
          </p>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate('') }}
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear dates
            </button>
          )}
        </div>

        {shown && (
          <p role="alert" className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            {shown}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-white/8 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create trip'}
        </button>
      </div>
    </form>
  )
}
