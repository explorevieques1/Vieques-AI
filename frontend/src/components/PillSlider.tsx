import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export type PillItem = {
  /** Stable id, also what `onSelect` receives. `null` is allowed — an "All"/"Top" pill. */
  key: string | null
  label: string
  icon?: LucideIcon
  /** Accent for this pill when active. Falls back to the slider's `accent`. */
  color?: string
}

type Props = {
  items: PillItem[]
  active: string | null
  onSelect: (key: string | null) => void
  /** Accessible name for the row, e.g. "Categories", "Restaurant types". */
  label: string
  /** Default active colour (hex) for pills without their own `color`. */
  accent?: string
  /**
   * `md` — 32px pills, 13px text: the glass strips (top bento, sheet).
   * `sm` — compact 11px pills that grow to 13px from `sm:` (desktop top bar).
   */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The app's one horizontal pill selector — the top bento's category slider and
 * every sub-category row use it, so they scroll and look the same everywhere.
 *
 * Horizontal scroll is the design, not a fallback: seven categories at 13px are
 * ~1.8 screens wide at 390px and no amount of shrinking fixes that. What makes
 * it feel clean rather than "a row that overflows":
 *  - scroll-snap, so a flick always lands on a pill edge;
 *  - edge fades that only show where there IS more — the right edge fades
 *    while pills are hidden to the right, the left once you have scrolled — so
 *    the last pill is never dimmed once you reach it;
 *  - the active pill scrolls itself into view (a pick made elsewhere — a
 *    suggestion, a search result — never leaves it parked off screen);
 *  - a mouse wheel scrolls it sideways, which is what lets desktop drop the
 *    visible scrollbar the old chip row needed to stay reachable.
 *
 * The active highlight is ONE shared "rubber" thumb (motion ported from React
 * Bits RubberSegment): on a pick it stretches across old + new pill, then the
 * trailing edge springs in and overshoots by SQUASH px before settling. Ported
 * rather than vendored: RubberSegment is a fixed-width segmented control (no
 * horizontal scroll, its thumb-drag captures sideways swipes) and needs
 * `motion`; this is the same curve on WAAPI with no dependency.
 *
 * Left-aligned, never centred: inside `overflow-x-auto`, centring clips the
 * START of a too-wide row and no amount of swiping gets it back.
 */
const keyOf = (k: string | null) => k ?? '__null'
// RubberSegment's timings: 190ms stretch on its ease-out, then the land + squash.
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
const DURATION = 460
const SQUASH = 3

type Span = { l: number; r: number }

export default function PillSlider({
  items,
  active,
  onSelect,
  label,
  accent = '#64DBE8',
  size = 'md',
  className = '',
}: Props) {
  const rowRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const shown = useRef<Span | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Parents build `items` inline, so its identity changes every render — key
  // the thumb's effects on the pill set itself or each re-render would cancel
  // a running animation.
  const itemsKey = items.map((it) => keyOf(it.key)).join('|')
  const lastItemsKey = useRef(itemsKey)

  /** Move the thumb onto the active pill; `glide` = rubber animation, else jump. */
  const place = useCallback(
    (glide: boolean) => {
      const track = trackRef.current
      const thumb = thumbRef.current
      if (!track || !thumb) return
      const pill = track.querySelector<HTMLElement>(`[data-key="${keyOf(active)}"]`)
      if (!pill) {
        thumb.style.opacity = '0'
        shown.current = null
        return
      }
      const b = { l: pill.offsetLeft, r: pill.offsetLeft + pill.offsetWidth }
      // Start from where the thumb IS — mid-flight if the user taps quickly.
      let a = shown.current
      const running = thumb.getAnimations()
      if (a && running.length) {
        const tr = track.getBoundingClientRect()
        const th = thumb.getBoundingClientRect()
        a = { l: th.left - tr.left, r: th.right - tr.left }
      }
      running.forEach((x) => x.cancel())
      thumb.style.opacity = '1'
      thumb.style.top = `${pill.offsetTop}px`
      thumb.style.height = `${pill.offsetHeight}px`
      thumb.style.left = `${b.l}px`
      thumb.style.width = `${b.r - b.l}px`
      shown.current = b
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!glide || !a || reduce || (a.l === b.l && a.r === b.r)) return
      const dir = (b.l + b.r) / 2 > (a.l + a.r) / 2 ? 1 : -1
      const stretched = { l: Math.min(a.l, b.l), r: Math.max(a.r, b.r) }
      const squashed = dir > 0 ? { l: b.l + SQUASH, r: b.r } : { l: b.l, r: b.r - SQUASH }
      const frame = (s: Span, offset: number) => ({
        left: `${s.l}px`,
        width: `${s.r - s.l}px`,
        offset,
        easing: EASE,
      })
      thumb.animate(
        [frame(a, 0), frame(stretched, 0.42), frame(squashed, 0.8), frame(b, 1)],
        { duration: DURATION },
      )
    },
    [active],
  )

  // A pick glides; a swapped pill set (category change) jumps.
  useLayoutEffect(() => {
    const swapped = lastItemsKey.current !== itemsKey
    lastItemsKey.current = itemsKey
    place(!swapped)
  }, [itemsKey, place])

  // Re-seat after layout changes (font load, resize) — unless mid-glide.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const ro = new ResizeObserver(() => {
      if (!thumbRef.current?.getAnimations().length) place(false)
    })
    ro.observe(track)
    return () => ro.disconnect()
  }, [itemsKey, place])

  const measure = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])

  // Re-measure on resize and whenever the pills change (a category switch
  // swaps the whole set).
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [measure, items])

  // Vertical wheel → horizontal scroll, only while there is somewhere to go,
  // so a wheel over a row that fits still scrolls the panel underneath.
  // Native listener: React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Keep the active pill in view.
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const pill = el.querySelector<HTMLElement>(`[data-key="${active ?? '__null'}"]`)
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [active])

  const mask = `linear-gradient(to right, ${edges.left ? 'transparent, #000 20px' : '#000, #000'}, ${
    edges.right ? '#000 calc(100% - 24px), transparent' : '#000'
  })`

  const activeItem = items.find((it) => it.key === active)
  const activeColor = activeItem?.color ?? accent

  const pillSize =
    size === 'md' ? 'h-8 px-3 text-[13px]' : 'px-2.5 py-1.5 text-[11px] sm:text-[13px]'

  return (
    <nav
      ref={rowRef}
      aria-label={label}
      onScroll={measure}
      className={`no-scrollbar min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain ${className}`}
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    >
      <div ref={trackRef} className="relative flex w-max gap-1">
        {/* The rubber thumb. left/top/width/height are written imperatively by
            place() — keep them out of this style object or React clobbers them. */}
        <span
          ref={thumbRef}
          aria-hidden
          className="pointer-events-none absolute rounded-xl"
          style={{
            opacity: 0,
            background: `${activeColor}26`,
            boxShadow: `inset 0 0 0 1px ${activeColor}59`,
            transition: 'background-color 200ms ease, box-shadow 200ms ease',
          }}
        />
        {items.map((it) => {
          const on = active === it.key
          const color = it.color ?? accent
          const Icon = it.icon
          return (
            <button
              key={it.key ?? '__null'}
              data-key={it.key ?? '__null'}
              onClick={() => onSelect(it.key)}
              aria-current={on ? 'true' : undefined}
              className={`relative flex shrink-0 snap-start items-center gap-1.5 rounded-xl whitespace-nowrap transition-colors ${pillSize} ${
                on ? 'font-semibold' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
              // Tailwind cannot build classes from a runtime colour, so the
              // accent is inline. The fill + ring live on the shared thumb.
              style={on ? { color } : undefined}
            >
              {Icon && <Icon size={14} strokeWidth={on ? 2.4 : 2} aria-hidden />}
              {it.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
