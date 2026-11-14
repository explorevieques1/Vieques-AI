import { ArrowRight } from 'lucide-react'

import type { Suggestion } from '../lib/api'
import type { CategorySlug } from '../lib/place'
import CategoryRow from './CategoryRow'

type Props = {
  suggestion: Suggestion | null
  loadingSuggestion: boolean
  /** Drops the suggestion currently shown on the map as its own pin. */
  onOpenSuggestion: (s: Suggestion) => void
  /** The arrow: draw a *different* suggestion and drop that on the map. */
  onNextSuggestion: () => void
  activeCategory: CategorySlug | null
  onSelectCategory: (slug: CategorySlug) => void
}

/**
 * The phone's one piece of top chrome: a single card holding two equal rows —
 * Suggestion of the Day, then the category slider.
 *
 * Replaces the greeting card (greeting + weather + suggestion) and the separate
 * floating category row. Two cards with a gap between them cost ~146px of map;
 * this is TOP_BENTO_H (see useMapInsets). The greeting and weather are gone for
 * now, to be re-homed elsewhere — useWeather() is untouched for that.
 *
 * "Same size" is enforced by construction: both rows share ROW, so they have the
 * same height, radius, fill and left inset. If you change one, change ROW.
 *
 * `pointer-events-auto` is load-bearing — the map sheet is a modal Radix dialog
 * (see the note in MapTopBar), so the body is `pointer-events: none`.
 */
const ROW = 'flex h-11 items-center rounded-2xl bg-white/4 px-1.5'

export default function TopBento({
  suggestion,
  loadingSuggestion,
  onOpenSuggestion,
  onNextSuggestion,
  activeCategory,
  onSelectCategory,
}: Props) {
  return (
    <div className="glass pointer-events-auto mx-3 flex flex-col gap-1.5 rounded-3xl p-1.5 sm:mx-5">
      {/* Row 1 — suggestion of the day. `min-w-0` + `truncate` keeps a long
          title on one line instead of growing the row. */}
      <div className={`${ROW} gap-2`}>
        <span className="grid w-8 shrink-0 place-items-center text-base leading-none" aria-hidden="true">
          {suggestion?.emoji ?? '✨'}
        </span>
        <button
          onClick={() => suggestion && onOpenSuggestion(suggestion)}
          disabled={!suggestion}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <span className="block text-[10px] leading-none text-muted-foreground">
            Suggestion of the day
          </span>
          <span className="mt-1 block truncate text-[13px] font-medium leading-none text-foreground">
            {loadingSuggestion && !suggestion
              ? 'Finding something…'
              : (suggestion?.title ?? 'Nothing today')}
          </span>
        </button>
        <button
          onClick={onNextSuggestion}
          aria-label="Another suggestion"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/8 text-foreground transition-colors hover:bg-white/14 disabled:opacity-40"
          disabled={loadingSuggestion}
        >
          <ArrowRight size={15} />
        </button>
      </div>

      {/* Row 2 — the category slider, same shell as row 1. */}
      <div className={ROW}>
        <CategoryRow active={activeCategory} onSelect={onSelectCategory} variant="embedded" />
      </div>
    </div>
  )
}
