import type { BeachFilters } from '../lib/api'

type Props = {
  filters: BeachFilters
  onChange: (next: BeachFilters) => void
  onClose: () => void
}

const TYPES = ['swimming', 'snorkeling', 'family', 'surfing', 'secluded', 'scenic']
const WATER = ['calm', 'moderate', 'rough']
const FACILITIES = ['restroom', 'parking', 'shade', 'picnic']

function BeachFilterPanel({ filters, onChange, onClose }: Props) {
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
    `px-3 py-1 text-xs rounded-full border transition-colors ${
      active
        ? 'bg-cyan-500 text-slate-900 border-cyan-500 font-medium'
        : 'text-slate-300 border-slate-600 hover:bg-slate-700'
    }`

  return (
    <div className="absolute z-30 w-72 rounded-lg bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl p-4"
      style={{ top: '7.5rem', left: '1rem' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Filter beaches</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="mb-3">
        <div className="text-xs text-slate-400 mb-1.5">Type</div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button key={t} onClick={() => toggleType(t)} className={chip(filters.type?.includes(t) ?? false)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-slate-400 mb-1.5">Water</div>
        <div className="flex flex-wrap gap-1.5">
          {WATER.map((w) => (
            <button key={w} onClick={() => setWater(w)} className={chip(filters.water === w)}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-slate-400 mb-1.5">Facilities</div>
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
        className="w-full py-1.5 text-xs rounded-md bg-slate-700 text-slate-200 hover:bg-slate-600"
      >
        Clear all
      </button>
    </div>
  )
}

export default BeachFilterPanel