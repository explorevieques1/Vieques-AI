import { X } from 'lucide-react'

import type { BeachFilters } from '../lib/api'
import { useIsMobile } from '../hooks/useIsMobile'
import { RESULTS_PANEL_W } from '../hooks/useMapInsets'

type Props = {
  filters: BeachFilters
  onChange: (next: BeachFilters) => void
  onClose: () => void
}

const TYPES = ['swimming', 'snorkeling', 'family', 'surfing', 'secluded', 'scenic']
const WATER = ['calm', 'moderate', 'rough']
const FACILITIES = ['restroom', 'parking', 'shade', 'picnic']

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/**
 * Beach filters, as a popover anchored to the search stack that opened it.
 *
 * Deliberately NOT a Drawer on mobile any more: the results/detail sheet is
 * already a vaul Drawer, and nesting a second one leaves the two fighting over
 * the same drag handling. A popover under the search bar is also less motion
 * for what is a three-tap interaction.
 */
function BeachFilterPanel({ filters, onChange, onClose }: Props) {
  const isMobile = useIsMobile()

  const toggleIn = (key: 'type' | 'facilities', v: string) => {
    const set = new Set(filters[key] ?? [])
    if (set.has(v)) set.delete(v)
    else set.add(v)
    onChange({ ...filters, [key]: [...set] })
  }
  const setWater = (w: string) =>
    onChange({ ...filters, water: filters.water === w ? undefined : w })
  const toggleRefuge = () =>
    onChange({ ...filters, refuge: filters.refuge === true ? undefined : true })

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition-colors ${
      active
        ? 'border-primary/40 bg-primary/15 font-medium text-primary'
        : 'border-white/8 bg-white/4 text-foreground hover:bg-white/8'
    }`

  return (
    <div
      className="glass absolute z-30 w-72 max-w-[calc(100vw-2rem)] space-y-3.5 rounded-3xl p-4 shadow-2xl"
      style={
        isMobile
          ? { top: '17rem', left: '1rem' }
          : { top: '9rem', left: `${RESULTS_PANEL_W + 40}px` }
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Filter beaches</h3>
        <button
          onClick={onClose}
          aria-label="Close filters"
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>

      <Group label="Type">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleIn('type', t)}
            className={chip(filters.type?.includes(t) ?? false)}
          >
            {t}
          </button>
        ))}
      </Group>

      <Group label="Water">
        {WATER.map((w) => (
          <button key={w} onClick={() => setWater(w)} className={chip(filters.water === w)}>
            {w}
          </button>
        ))}
      </Group>

      <Group label="Facilities">
        {FACILITIES.map((f) => (
          <button
            key={f}
            onClick={() => toggleIn('facilities', f)}
            className={chip(filters.facilities?.includes(f) ?? false)}
          >
            {f}
          </button>
        ))}
      </Group>

      <button onClick={toggleRefuge} className={chip(filters.refuge === true)}>
        In wildlife refuge
      </button>

      <button
        onClick={() => onChange({})}
        className="w-full rounded-xl border border-white/8 bg-white/4 py-2 text-xs text-foreground hover:bg-white/8"
      >
        Clear all
      </button>
    </div>
  )
}

export default BeachFilterPanel
