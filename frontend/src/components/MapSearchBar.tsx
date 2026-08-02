import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { MAP_STYLES } from '../lib/mapStyles'
import { categoryMeta, type Place } from '../lib/place'
import { rankHits, type IslandIndexState, type SearchHit } from '../hooks/useIslandSearch'

type Props = {
  /** Searched client-side; whatever the current category loaded. */
  places: Place[]
  onSelect: (p: Place) => void
  /**
   * The island-wide index (hooks/useIslandSearch).
   *
   * When present the field searches every category rather than only the
   * loaded one, and renders the scanning animation while the index fills.
   * Optional so the component still works anywhere the index is not wired.
   */
  index?: IslandIndexState
  /** Called on first focus to kick off the index fetch — lazy by design. */
  onIndexStart?: () => void
  /** Picking a cross-category hit has to switch the app into that category. */
  onSelectHit?: (hit: SearchHit) => void
  placeholder?: string
  styleId: string
  onStyleChange: (id: string) => void
  /**
   * Mobile: the sheet promotes itself to full height while the field has focus.
   *
   * On focus rather than on submit, for two reasons. It is better UX — the
   * results are visible as you type — and it dodges a vaul bug: its keyboard
   * repositioning guards on `if (… && activeSnapPointIndex)`, and index 0 is
   * falsy, so at the lowest snap it omits the active-snap term and writes a
   * wrong height straight to the element.
   */
  onFocusChange?: (focused: boolean) => void
  /**
   * Phone layout: tighter spacing, and no basemap switcher.
   *
   * The four-up Satellite/Streets/Outdoor/Basic row is a whole line of a panel
   * that floats over the map, and it is a set-once preference — it does not
   * earn permanent space on a 390px screen the way search and filters do. The
   * phone gets to it through the globe button over the map instead.
   */
  compact?: boolean
  /**
   * `stack` — search + basemap switcher + filter chips, the panel/sheet header.
   * `input` — just the field and its results dropdown, for the top bar's
   *           quick-search row where the pills used to be.
   */
  variant?: 'stack' | 'input'
  /** `input` variant only: no category loaded, so there is nothing to match. */
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * Search, map-layer switcher and filter chips as one stack.
 *
 * Previously these were three separately-positioned floating elements in
 * MapView, each with its own hand-tuned `left` offset that had to be kept in
 * sync as panels opened. Grouping them means the panel owns the layout.
 */
function MapSearchBar({
  places,
  onSelect,
  index,
  onIndexStart,
  onSelectHit,
  placeholder = 'Search beaches, bays, coves…',
  styleId,
  onStyleChange,
  onFocusChange,
  compact = false,
  variant = 'stack',
  disabled = false,
  autoFocus = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search, the convention in every map and docs app. Ignored while
  // the user is already typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The top bar's quick-search row is opened by an explicit tap on the search
  // icon, so the field should already be live — one tap, not two. Deliberately
  // not the `autoFocus` attribute: this mounts inside an animating row, and
  // React's autoFocus fires before that settles.
  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus()
  }, [autoFocus, disabled])

  const q = query.trim().toLowerCase()

  /**
   * Island-wide results when the index is wired, the loaded category otherwise.
   *
   * The fallback is not dead code: the index only starts filling on first
   * focus, so the first keystrokes of a fast typist land while `hits` is still
   * empty. Falling back to the loaded category means those keystrokes still
   * match something rather than showing "no results" and then silently
   * changing their mind a second later.
   */
  const indexed = index ? rankHits(index.hits, q) : []
  const localMatches = q
    ? places
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.subtitle?.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, 8)
    : []

  /**
   * The rows to render: index hits carry their category, fallback rows do not.
   *
   * `category: null` rather than a placeholder slug. An earlier version put
   * `'beaches'` here and relied on the render guard to never show it — but the
   * same value also feeds `onSelectHit`, which *switches the app's category*,
   * so a fallback row was one missed guard away from throwing the user into
   * Beaches for picking a restaurant. Null cannot be mistaken for an answer.
   */
  const rows: { place: Place; hit: SearchHit | null }[] =
    indexed.length > 0
      ? indexed.map((h) => ({ place: h.place, hit: h }))
      : localMatches.map((p) => ({ place: p, hit: null }))

  /** Searching is only worth animating while there is a query to search for. */
  const searching = Boolean(index?.loading && q)
  const noResults = Boolean(q && !searching && rows.length === 0 && index?.ready)

  const pick = (row: { place: Place; hit: SearchHit | null }) => {
    // A hit knows its category, so opening it can switch the app into that
    // category. A fallback row is already in the loaded one — plain select.
    if (row.hit && onSelectHit) onSelectHit(row.hit)
    else onSelect(row.place)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const layers = (
    <div className="flex gap-1 rounded-2xl border border-white/6 bg-white/3 p-1">
      {MAP_STYLES.map((s) => (
        <button
          key={s.id}
          onClick={() => onStyleChange(s.id)}
          className={`flex-1 rounded-xl py-1.5 text-xs transition-colors ${
            styleId === s.id
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )

  const search = (
    <div className="relative">
      <div
        className={`flex items-center gap-2.5 rounded-2xl border border-white/6 bg-white/4 px-3.5 ${
          compact ? 'py-2' : 'py-2.5'
        }`}
      >
        {/* The magnifier doubles as the activity indicator: while the sweep is
            running it pulses in the accent colour, so the thing you are looking
            at when you type is the thing that tells you work is happening. */}
        <Search
          size={15}
          className={`shrink-0 transition-colors ${
            searching ? 'animate-pulse text-primary' : 'text-muted-foreground'
          }`}
        />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            onIndexStart?.()
            onFocusChange?.(true)
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120)
            onFocusChange?.(false)
          }}
          placeholder={disabled ? 'Pick a category to search…' : placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
        />
        {query ? (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        ) : (
          <kbd className="hidden rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
            /
          </kbd>
        )}
      </div>

      {/* The scanning sweep. A hairline under the field rather than a spinner
          in place of the results: the list below stays readable and keeps
          filling as each category lands, so the animation reports progress
          without ever blanking what the user is already reading. The indent
          bar tracks real progress; the sweep on top of it is what makes an
          8-request fan-out feel like one continuous action. */}
      {searching && (
        <div
          className="absolute inset-x-3 -bottom-px h-0.5 overflow-hidden rounded-full bg-white/8"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(8, (index?.progress ?? 0) * 100)}%` }}
          />
          <div className="search-sweep absolute inset-y-0 w-1/3" />
        </div>
      )}

      {open && (searching || rows.length > 0 || noResults) && (
        <div className="glass absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl py-1.5 shadow-2xl scroll-contain">
          {/* Which category is being pulled in right now. Naming it is the
              difference between "something is loading" and "your restaurant
              has not been checked yet" — the user can tell whether to keep
              waiting or retype. */}
          {searching && (
            <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Searching {index?.stage ? categoryMeta(index.stage).label.toLowerCase() : 'the island'}
              …
            </div>
          )}

          {/* Skeleton rows only while there is nothing yet — once the first
              category lands, real results replace them and never flicker back. */}
          {searching &&
            rows.length === 0 &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3.5 py-2">
                <div
                  className="h-4 w-4 shrink-0 animate-pulse rounded bg-white/8"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div
                    className="h-2.5 animate-pulse rounded bg-white/8"
                    style={{ width: `${70 - i * 12}%`, animationDelay: `${i * 120}ms` }}
                  />
                  <div
                    className="h-2 animate-pulse rounded bg-white/5"
                    style={{ width: `${45 - i * 8}%`, animationDelay: `${i * 120 + 60}ms` }}
                  />
                </div>
              </div>
            ))}

          <ul>
            {rows.map((row, i) => {
              const p = row.place
              const meta = row.hit ? categoryMeta(row.hit.category) : null
              return (
                <li
                  key={`${row.hit?.category ?? 'local'}:${p.id}`}
                  className="search-row"
                  // Staggered so a batch landing together reads as a list
                  // filling in rather than a block appearing. Capped: past
                  // ~10 rows the delay is longer than anyone waits.
                  style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                >
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(row)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/5"
                  >
                    <span className="text-base leading-none">{p.icon.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{p.name}</span>
                      {p.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.subtitle}
                        </span>
                      )}
                    </span>
                    {/* Which category the row belongs to, in that category's
                        own accent — the same hue as its pill and its pins, so
                        a cross-category list still reads at a glance. */}
                    {meta && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]"
                        style={{ background: `${meta.color}1f`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {noResults && (
            <p className="px-3.5 py-3 text-xs text-muted-foreground">
              Nothing on the island matches “{query.trim()}”.
            </p>
          )}
        </div>
      )}
    </div>
  )

  if (variant === 'input') return search

  return (
    <div className={`relative flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {search}

      {/* Map layers — desktop only, as a permanent control. The phone reaches
          the same setter through the globe button over the map, which opens
          MapModesSheet; a chip here as well was two controls for one setting. */}
      {!compact && layers}
    </div>
  )
}

export default MapSearchBar
