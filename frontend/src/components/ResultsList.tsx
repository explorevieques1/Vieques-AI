import { X } from 'lucide-react'

import type { Subcategory } from '../hooks/useCategoryPlaces'
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
  onSelectSub: (slug: string) => void
  sort: SortKey
  onSortChange: (s: SortKey) => void
  distances: Map<string, number>
  /** Desktop only — the sheet has its own dismiss affordance on mobile. */
  onClose?: () => void
  /** Rendered above the list, e.g. the snorkelling upsell or tour toggle. */
  banner?: React.ReactNode
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
}: Props) {
  const meta = categoryMeta(category)

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

      {/* Subcategory chips — the old sidebars' entire job, compressed to a row. */}
      {subcategories.length > 0 && (
        <div className="no-scrollbar shrink-0 overflow-x-auto px-4 pb-3">
          <div className="flex w-max gap-1.5">
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

      <div className="scroll-contain no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] shrink-0 rounded-2xl" />
          ))}

        {!loading && places.length === 0 && (
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
