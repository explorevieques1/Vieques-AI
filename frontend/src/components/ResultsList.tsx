import { AlertTriangle, ChevronDown, PanelLeftClose, X } from 'lucide-react'

import type { Subcategory } from '../hooks/useCategoryPlaces'
import { ApiError, LANDING_URL } from '../lib/api'
import { categoryMeta, type CategorySlug, type Place } from '../lib/place'
import { LIQUID_GLASS } from '../lib/glass'
import PlaceCard from './PlaceCard'
import PillSlider from './PillSlider'
import GlassSurface from './reactbits/GlassSurface'
import { Skeleton } from './ui/skeleton'

/** `all` is also a view, not just an order: every listing in the category, A–Z. */
export type SortKey = 'nearest' | 'name' | 'all'

const NEXT_SORT: Record<SortKey, SortKey> = { nearest: 'name', name: 'all', all: 'nearest' }
const SORT_LABEL: Record<SortKey, string> = { nearest: 'Nearest', name: 'A–Z', all: 'All' }

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
  /**
   * Get the list out of the way *without* losing it — distinct from `onClose`,
   * which drops the category and its results entirely. Desktop folds the panel
   * to a tab at the edge; mobile drops the sheet to its collapsed stop.
   */
  onCollapse?: () => void
  /** Which way `onCollapse` visually moves the panel. */
  collapseDirection?: 'left' | 'down'
  /** Rendered above the list, e.g. the snorkelling upsell or tour toggle. */
  banner?: React.ReactNode
  /** Surfaced in place of the empty state — never swallow a failed fetch. */
  error?: ApiError | Error | null
  /** Place ids the user has saved. Omit to render cards without a heart. */
  savedIds?: Set<string>
  onToggleSave?: (p: Place) => void
  /** Mobile: pad the scroller so the last card clears the bottom nav. */
  navPad?: boolean
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
  onCollapse,
  collapseDirection = 'left',
  banner,
  error,
  savedIds,
  onToggleSave,
  navPad = false,
}: Props) {
  const meta = categoryMeta(category)
  const upgradeable = error instanceof ApiError && error.isUpgradeable

  return (
    <>
      {/* Category accent as a hairline over the header: the same hue as the
          pill, the pins and the active nav cell, so the panel says which
          category it belongs to without spending a line of type on it. */}
      <div
        className="h-0.5 shrink-0"
        style={{ background: `linear-gradient(to right, ${meta.color}, transparent)` }}
        aria-hidden="true"
      />
      {/* Order under the search bar: slider → count + sort → list, so the
          control you use most sits closest to your thumb and the count reads
          as the caption of the list it counts.

          Sub-category slider — the same glass strip + PillSlider as the top
          bento's category row, so every pill row in the app scrolls and looks
          the same. Replaced plain chips over a visible scrollbar; PillSlider's
          edge fades and wheel-to-horizontal scrolling keep the overflowed
          pills findable and reachable without one. Accent = the category's
          colour, matching its pins and the top pill. */}
      {subcategories.length > 0 && (
        <div className="shrink-0 px-4 pt-3">
          <GlassSurface {...LIQUID_GLASS} width="100%" height={44} borderRadius={16} className="vq-glass vq-glass--flush">
            <div className="flex h-full w-full items-center px-1.5">
              <PillSlider
                label={`${meta.label} types`}
                accent={meta.color}
                // "All" ignores the chips; a key no pill has hides the thumb
                // so neither "Top" nor the remembered pick looks selected.
                active={sort === 'all' ? '__all__' : activeSub}
                onSelect={onSelectSub}
                items={[
                  // Where chips only narrow a loaded list (stays, restaurants),
                  // "no sub" is a real state the user starts in — it gets the
                  // first pill. Categories that gate on a pick have no such state.
                  ...(meta.optionalSubcategories
                    ? [{ key: null, label: meta.allChip?.label ?? 'All', icon: meta.allChip?.icon }]
                    : []),
                  ...subcategories.map((sc) => ({ key: sc.slug, label: sc.label })),
                ]}
              />
            </div>
          </GlassSurface>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-2.5">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.16em]"
          style={{ color: meta.color }}
        >
          {loading
            ? 'Loading…'
            : `${places.length} ${places.length === 1 ? meta.label.replace(/s$/, '') : meta.label}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSortChange(NEXT_SORT[sort])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Sort: {SORT_LABEL[sort]} ↓
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              aria-label="Collapse results"
              title="Collapse results"
              className="text-muted-foreground hover:text-foreground"
            >
              {collapseDirection === 'down' ? (
                <ChevronDown size={16} />
              ) : (
                <PanelLeftClose size={15} />
              )}
            </button>
          )}
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

      {banner && <div className="shrink-0 px-4 pb-3">{banner}</div>}

      <div
        className={`scroll-contain scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 ${
          navPad ? 'pb-[calc(1rem+var(--nav-clear))]' : 'pb-4'
        }`}
      >
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
              saved={savedIds?.has(p.id)}
              onToggleSave={onToggleSave}
            />
          ))}
      </div>
    </>
  )
}

export default ResultsList
