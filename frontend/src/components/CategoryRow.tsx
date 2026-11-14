import { CATEGORIES, type CategorySlug } from '../lib/place'
import PillSlider from './PillSlider'

type Props = {
  active: CategorySlug | null
  onSelect: (slug: CategorySlug) => void
  /**
   * `floating` — the phone's own glass row under the greeting card.
   * `inline`   — sits inside the desktop top bar's control row.
   * `embedded` — bare pills, for a parent that supplies the shell (TopBento).
   */
  variant?: 'floating' | 'inline' | 'embedded'
}

/**
 * The seven top-level categories.
 *
 * Horizontal scroll is not a fallback here, it is the design. With icons and
 * 11px labels the row is ~690px of content — 1.8 screens at 390px — and no
 * amount of shrinking fixes that: a two-line icon-above-label pill needs 7×56 =
 * 392px and overflows anyway, at double the height. So the row scrolls — see
 * PillSlider for the snap, edge fades and keep-active-in-view behaviour.
 *
 * Previously this lived inside MapTopBar and was rendered twice (once inline for
 * `lg`, once as its own row below it) — two copies of the same nav that had to
 * be kept in step by hand.
 */
export default function CategoryRow({ active, onSelect, variant = 'floating' }: Props) {
  // Scrolling, snapping, edge fades and keep-active-in-view all live in
  // PillSlider, shared with the sheet's sub-category rows.
  const pills = (
    <PillSlider
      label="Categories"
      items={CATEGORIES.map((c) => ({ key: c.slug, label: c.label, icon: c.icon, color: c.color }))}
      active={active}
      onSelect={(key) => key && onSelect(key as CategorySlug)}
      size={variant === 'inline' ? 'sm' : 'md'}
    />
  )

  if (variant === 'embedded') return pills

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
