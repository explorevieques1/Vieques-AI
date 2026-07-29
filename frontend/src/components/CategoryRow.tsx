import { useEffect, useRef } from 'react'

import { CATEGORIES, type CategorySlug } from '../lib/place'

type Props = {
  active: CategorySlug | null
  onSelect: (slug: CategorySlug) => void
  /**
   * `floating` — the phone's own glass row under the greeting card.
   * `inline`   — sits inside the desktop top bar's control row.
   */
  variant?: 'floating' | 'inline'
}

/**
 * The seven top-level categories.
 *
 * Horizontal scroll is not a fallback here, it is the design. With icons and
 * 11px labels the row is ~690px of content — 1.8 screens at 390px — and no
 * amount of shrinking fixes that: a two-line icon-above-label pill needs 7×56 =
 * 392px and overflows anyway, at double the height. So the row scrolls, `.fade-r`
 * advertises that it does, and scroll-snap makes it land cleanly.
 *
 * Left-aligned rather than centred: inside `overflow-x-auto`, centring clips the
 * START of a too-wide row and no amount of swiping gets it back.
 *
 * Previously this lived inside MapTopBar and was rendered twice (once inline for
 * `lg`, once as its own row below it) — two copies of the same nav that had to
 * be kept in step by hand.
 */
export default function CategoryRow({ active, onSelect, variant = 'floating' }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)

  // Keep the active pill in view. Tapping "Essentials", drilling in and coming
  // back should not leave the selection parked off screen — and the suggestion
  // card can change the category without any pill being tapped at all.
  useEffect(() => {
    const row = rowRef.current
    if (!row || !active) return
    const el = row.querySelector<HTMLElement>(`[data-slug="${active}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [active])

  const pills = (
    <nav
      ref={rowRef}
      aria-label="Categories"
      className="no-scrollbar fade-r snap-x snap-mandatory overflow-x-auto"
    >
      <div className="flex w-max gap-1">
        {CATEGORIES.map((c) => {
          const on = active === c.slug
          const Icon = c.icon
          return (
            <button
              key={c.slug}
              data-slug={c.slug}
              onClick={() => onSelect(c.slug)}
              aria-current={on ? 'page' : undefined}
              className={`flex shrink-0 snap-start items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px]
                          whitespace-nowrap transition-colors sm:text-[13px] ${
                            on
                              ? 'font-semibold'
                              : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                          }`}
              // Tailwind v4 cannot generate a class from a runtime value, so the
              // category accent is applied inline — same approach as PlaceCard's
              // icon tile.
              style={
                on
                  ? { background: `${c.color}26`, color: c.color, boxShadow: `inset 0 0 0 1px ${c.color}59` }
                  : undefined
              }
            >
              <Icon size={14} strokeWidth={on ? 2.4 : 2} />
              {c.label}
            </button>
          )
        })}
      </div>
    </nav>
  )

  if (variant === 'inline') {
    return (
      <div className="glass pointer-events-auto hidden min-w-0 rounded-2xl p-1.5 lg:block">
        {pills}
      </div>
    )
  }

  return (
    <div className="glass pointer-events-auto mx-3 w-auto rounded-2xl p-1 sm:mx-5">{pills}</div>
  )
}
