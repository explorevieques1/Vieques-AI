import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { MAP_STYLES } from '../lib/mapStyles'
import type { Place } from '../lib/place'

type Props = {
  /** Searched client-side; whatever the current category loaded. */
  places: Place[]
  onSelect: (p: Place) => void
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
  const matches = q
    ? places
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.subtitle?.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, 8)
    : []

  const pick = (p: Place) => {
    onSelect(p)
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
        <Search size={15} className="shrink-0 text-muted-foreground" />
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

      {open && matches.length > 0 && (
        <ul className="glass absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl py-1.5 shadow-2xl scroll-contain">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
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
              </button>
            </li>
          ))}
        </ul>
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
