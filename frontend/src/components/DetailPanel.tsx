import type { Beach } from '../lib/api'

type Props = {
  beach: Beach | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  )
}

function DetailPanel({ beach, onClose }: Props) {
  if (!beach) return null

  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-20 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white leading-tight">{beach.name}</h2>
          {beach.local_name && <p className="text-sm text-slate-400">{beach.local_name}</p>}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5 space-y-4 overflow-y-auto">
        {beach.type?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {beach.type.map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/15 text-cyan-300">
                {t}
              </span>
            ))}
          </div>
        )}

        {beach.in_wildlife_refuge && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-sm text-amber-200">
            ⚠ Inside the wildlife refuge
            {beach.gate_hours && beach.gate_hours !== 'N/A' && (
              <span className="block text-amber-300/80 text-xs mt-0.5">{beach.gate_hours}</span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {beach.region && <Row label="Region" value={beach.region} />}
          {beach.access && <Row label="Access" value={beach.access} />}
          {beach.water_conditions && <Row label="Water" value={beach.water_conditions} />}
          {beach.best_for && <Row label="Best for" value={beach.best_for} />}
          {beach.facilities?.length > 0 && (
            <Row label="Facilities" value={beach.facilities.join(', ')} />
          )}
        </div>

        {beach.notes && (
          <p className="text-sm text-slate-300 leading-relaxed border-t border-slate-800 pt-4">
            {beach.notes}
          </p>
        )}

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${beach.latitude},${beach.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="block text-center bg-cyan-500 text-slate-900 font-medium rounded-lg py-2.5 hover:bg-cyan-400 transition-colors"
        >
          Get Directions
        </a>
      </div>
    </aside>
  )
}

export default DetailPanel