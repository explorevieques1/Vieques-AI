import { AlertTriangle, X } from 'lucide-react'

import type { Subcategory } from '../hooks/useCategoryPlaces'
import { ApiError, LANDING_URL } from '../lib/api'
import { categoryMeta, type CategorySlug, type Place } from '../lib/place'
import PlaceCard from './PlaceCard'
import { Skeleton } from './ui/skeleton'

export type SortKey = 'nearest' | 'name'

type Props = {
  category: CategorySlug
  places: Place[]
  loading: boolean
  selectedId: string | null
  onSelect: (p: Place) => void
  subcategories: Subcategory[]
  activeSub: string | null
  /** `null` clears the filter — only reachable where the pick is optional. */
  onSelectSub: (slug: string | null) => void
  sort: SortKey
  onSortChange: (s: SortKey) => void
  distances: Map<string, number>
  /** Desktop only — the sheet has its own dismiss affordance on mobile. */
  onClose?: () => void
  /** Rendered above the list, e.g. the snorkelling upsell or tour toggle. */
  banner?: React.ReactNode
  /** Surfaced in place of the empty state — never swallow a failed fetch. */
  error?: ApiError | Error | null
}

/**
 * The list of matching places for the current category.
 *
 * This is the piece the old UI never had. Four separate sidebars
 * (CategoryListSidebar, RestaurantSidebar, EssentialsSidebar,
 * TransportationSidebar) listed *subcategory slugs* and then left the user to
 * hunt for pins on the map. Here subcategories are a chip row at the top and
 * the body is always the actual places.
 */
function ResultsList({
  category,
  places,
  loading,
  selectedId,
  onSelect,
  subcategories,
  activeSub,
  onSelectSub,
  sort,
  onSortChange,
  distances,
  onClose,
  banner,
  error,
}: Props) {
  const meta = categoryMeta(category)
  const upgradeable = error instanceof ApiError && error.isUpgradeable

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {loading
            ? 'Loading…'
            : `Results · ${places.length} ${places.length === 1 ? meta.label.replace(/s$/, '') : meta.label}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSortChange(sort === 'nearest' ? 'name' : 'nearest')}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Sort: {sort === 'nearest' ? 'Nearest' : 'A–Z'} ↓
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close results"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Subcategory chips — the old sidebars' entire job, compressed to a row.
          Visible scrollbar, not `.no-scrollbar`: these chips are the only way
          into a subcategory, and there are more of them than fit the panel
          width. A hidden bar leaves the overflowed ones both undiscoverable and
          unreachable with a mouse. The inner `pb-2` reserves the track's height
          so it sits under the chips rather than over them. */}
      {subcategories.length > 0 && (
        <div className="scrollbar-thin shrink-0 overflow-x-auto px-4 pb-2">
          <div className="flex w-max gap-1.5 pb-2">
            {/* Where the chips only filter (stays), the unfiltered list is a
                real state the user started in — so it needs a chip to get back
                to. Categories that gate on a pick have no such state. */}
            {meta.optionalSubcategories && (
              <button
                onClick={() => onSelectSub(null)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                  activeSub == null
                    ? 'border border-primary/30 bg-primary/15 font-medium text-primary'
                    : 'border border-white/8 bg-white/4 text-foreground hover:bg-white/8'
                }`}
              >
                All
              </button>
            )}
            {subcategories.map((s) => (
              <button
                key={s.slug}
                onClick={() => onSelectSub(s.slug)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                  activeSub === s.slug
                    ? 'border border-primary/30 bg-primary/15 font-medium text-primary'
                    : 'border border-white/8 bg-white/4 text-foreground hover:bg-white/8'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {banner && <div className="shrink-0 px-4 pb-3">{banner}</div>}

      <div className="scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
          ))}

        {!loading && error && (
          <div
            className={`rounded-2xl border px-3.5 py-3 text-sm ${
              upgradeable
                ? 'border-primary/30 bg-primary/10 text-foreground'
                : 'border-destructive/30 bg-destructive/10 text-foreground'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p>
                  {upgradeable
                    ? `${meta.label} aren't included in your current plan.`
                    : `Couldn't load ${meta.label.toLowerCase()}.`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
                {upgradeable && (
                  <a
                    href={`${LANDING_URL}/pricing`}
                    className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    See plans
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && places.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {meta.comingSoon
              ? `${meta.label} are coming soon.`
              : meta.hasSubcategories && !activeSub
                ? 'Pick a category above to see listings.'
                : 'Nothing matches yet — try a different filter.'}
          </p>
        )}

        {!loading &&
          places.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              selected={p.id === selectedId}
              onSelect={onSelect}
              distanceMi={distances.get(p.id)}
            />
          ))}
      </div>
    </>
  )
}

export default ResultsList
