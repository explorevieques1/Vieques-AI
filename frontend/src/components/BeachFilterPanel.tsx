import type { BeachFilters } from '../lib/api'
import { useIsMobile } from '../hooks/useIsMobile'
import { Drawer, DrawerContent, DrawerTitle } from './ui/drawer'

type Props = {
  filters: BeachFilters
  onChange: (next: BeachFilters) => void
  onClose: () => void
}

const TYPES = ['swimming', 'snorkeling', 'family', 'surfing', 'secluded', 'scenic']
const WATER = ['calm', 'moderate', 'rough']
const FACILITIES = ['restroom', 'parking', 'shade', 'picnic']

function BeachFilterPanel({ filters, onChange, onClose }: Props) {
  const isMobile = useIsMobile()

  const toggleType = (t: string) => {
    const set = new Set(filters.type ?? [])
    set.has(t) ? set.delete(t) : set.add(t)
    onChange({ ...filters, type: [...set] })
  }
  const toggleFacility = (f: string) => {
    const set = new Set(filters.facilities ?? [])
    set.has(f) ? set.delete(f) : set.add(f)
    onChange({ ...filters, facilities: [...set] })
  }
  const setWater = (w: string) =>
    onChange({ ...filters, water: filters.water === w ? undefined : w })
  const toggleRefuge = () =>
    onChange({ ...filters, refuge: filters.refuge === true ? undefined : true })

  const clearAll = () => onChange({})

  const chip = (active: boolean) =>
    `px-3 py-1.5 text-xs rounded-full border transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary font-medium'
        : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground'
    }`

  const body = (
    <>
      <div className="mb-3">
        <div className="text-xs text-muted-foreground mb-1.5">Type</div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t} onClick={() => toggleType(t)} className={chip(filters.type?.includes(t) ?? false)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-muted-foreground mb-1.5">Water</div>
        <div className="flex flex-wrap gap-1.5">
          {WATER.map((w) => (
            <button key={w} onClick={() => setWater(w)} className={chip(filters.water === w)}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-muted-foreground mb-1.5">Facilities</div>
        <div className="flex flex-wrap gap-1.5">
          {FACILITIES.map((f) => (
            <button key={f} onClick={() => toggleFacility(f)} className={chip(filters.facilities?.includes(f) ?? false)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <button onClick={toggleRefuge} className={chip(filters.refuge === true)}>
          In wildlife refuge
        </button>
      </div>

      <button
        onClick={clearAll}
        className="w-full py-2 text-xs rounded-md bg-secondary text-secondary-foreground hover:bg-accent"
      >
        Clear all
      </button>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent>
          <DrawerTitle className="sr-only">Filter beaches</DrawerTitle>
          <div className="px-4 pb-4 pt-1">
            <h3 className="text-sm font-semibold text-foreground mb-3">Filter beaches</h3>
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <div
      className="absolute z-30 w-72 rounded-xl bg-card/95 backdrop-blur border border-border shadow-2xl p-4"
      style={{ top: '7.5rem', left: '1rem' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Filter beaches</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
      </div>
      {body}
    </div>
  )
}

export default BeachFilterPanel
