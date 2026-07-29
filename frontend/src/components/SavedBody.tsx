import { Heart } from 'lucide-react'

import type { Favorites } from '../hooks/useFavorites'
import type { Place } from '../lib/place'
import PlaceCard from './PlaceCard'
import { Skeleton } from './ui/skeleton'

type Props = {
  favorites: Favorites
  selectedId: string | null
  onSelect: (p: Place) => void
  /** Miles from the user, keyed by place id. */
  distances: Map<string, number>
  /** Desktop only. */
  onClose?: () => void
  /** Mobile: clear the bottom nav with the scroller's bottom padding. */
  navPad?: boolean
}

/**
 * Saved places.
 *
 * Renders the same PlaceCard as the results list, so a saved beach looks like
 * the beach you saved. The rows come from each favorite's stored snapshot rather
 * than a live lookup — Saved spans up to seven listing tables and resolving it
 * live would be seven requests for a list that is usually four items long. See
 * the note on `snapshot` in db/migrations/0032_favorites.sql.
 */
export default function SavedBody({
  favorites,
  selectedId,
  onSelect,
  distances,
  onClose,
  navPad = false,
}: Props) {
  const { places, loading, toggle } = favorites

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/8 px-4 pb-3 pt-4">
        <div>
          <h2 className="font-display text-xl leading-none tracking-tight">Saved</h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${places.length} place${places.length === 1 ? '' : 's'}`}
          </p>
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
            />
          ))}
      </div>
    </>
  )
}
