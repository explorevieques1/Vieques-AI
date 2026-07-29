import { X } from 'lucide-react'

import type { FilterChip } from '../lib/filters'

type Props = {
  chips: FilterChip[]
  onToggle: (key: string) => void
  onClear: () => void
  /** The active category's accent, for the on-state tint. */
  accent?: string
}

/**
 * The filter chips for the current category.
 *
 * Replaces BeachFilterPanel, which was a hardcoded beach-only popover pinned to
 * the map with a magic `top: 17rem` — an offset that would break the moment the
 * top bar changed height, which this rebuild does. An inline row inside the
 * panel has no offset to get wrong, works at both widths, and works for all
 * seven categories because the chips come from the data (see lib/filters.ts).
 *
 * Scrolls horizontally: on a phone the chips are always wider than 366px, and
 * `.fade-r` is the affordance that says so.
 */
export default function FilterRow({ chips, onToggle, onClear, accent }: Props) {
  if (chips.length === 0) return null
  const activeCount = chips.filter((c) => c.active).length

  return (
    <div className="shrink-0 border-b border-white/8 px-4 py-2">
      <div className="no-scrollbar fade-r -mx-1 overflow-x-auto px-1">
        <div className="flex w-max items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => onToggle(c.key)}
              aria-pressed={c.active}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] whitespace-nowrap transition-colors ${
                c.active
                  ? 'font-semibold text-foreground'
                  : 'border-white/8 bg-white/4 text-foreground/85 hover:bg-white/8'
              }`}
              style={
                c.active && accent
                  ? { background: `${accent}26`, borderColor: `${accent}66`, color: accent }
                  : undefined
              }
            >
              <span aria-hidden="true">{c.icon}</span>
              {c.label}
              <span className="font-mono text-[9px] opacity-60">{c.count}</span>
            </button>
          ))}

          {/* Only once there is something to clear — an always-visible reset on
              an empty filter set is a control that does nothing. */}
          {activeCount > 0 && (
            <button
              onClick={onClear}
              className="flex shrink-0 items-center gap-1 rounded-full border border-white/8 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-white/8 hover:text-foreground"
            >
              <X size={11} />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
